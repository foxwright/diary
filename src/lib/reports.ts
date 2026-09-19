import { activeStore } from '../knowledge';
import {
  MONTH_REPORT_MAX_CHARS,
  monthSummaryPrompt,
  promptTag,
  YEAR_REPORT_MAX_CHARS,
  yearRollupPrompt,
} from '../prompts';
import { db } from '../db';
import type { MonthlyReport, ReportLayers, YearlyReport, YearlyScope } from '../types';
import { REPORT_LAYER_KEYS } from '../types';
import { dateKeyOf, daysElapsed, daysInMonth, monthRange, shiftMonth, todayKey } from './date';
import { planDistill, runDistill, type DistillStats } from './distill';
import { asString } from './json';
import { chatJson } from './llm';
import { newId } from './id';
import { track } from './telemetry';

function normalizeLayers(raw: unknown): ReportLayers {
  const bag =
    raw && typeof raw === 'object'
      ? ((raw as Record<string, unknown>).layers ?? raw)
      : {};
  const record = bag as Record<string, unknown>;
  const out = { behavior: '', todo: '', cognition: '', guidance: '' };
  for (const key of REPORT_LAYER_KEYS) {
    out[key] = asString(record[key]).trim();
  }
  return out;
}

export interface DistillPreview {
  monthKey: string;
  days: number;
  isPartial: boolean;
  segments: {
    index: number;
    from: string;
    to: string;
    entryCount: number;
    willSkip: boolean;
  }[];
  toCall: number;
  toSkip: number;
  cachedSegments: number;
}

export async function previewMonth(monthKey: string): Promise<DistillPreview> {
  const days = daysElapsed(monthKey);
  const plan = await planDistill(monthKey);
  const cached = await db.segments.where('monthKey').equals(monthKey).count();
  return {
    monthKey,
    days,
    isPartial: days < daysInMonth(monthKey),
    segments: plan.map((p) => ({
      index: p.segment.index,
      from: p.segment.from,
      to: p.segment.to,
      entryCount: p.entries.length,
      willSkip: p.cached !== null,
    })),
    toCall: plan.filter((p) => !p.cached && p.entries.length > 0).length,
    toSkip: plan.filter((p) => p.cached !== null).length,
    cachedSegments: cached,
  };
}

export interface MonthlyRunResult {
  report: MonthlyReport;
  stats: DistillStats;
  reduceTokens: number;
  synced: boolean;
  syncError?: string;
}

export async function generateMonthlyReport(
  monthKey: string,
  options: { sync?: boolean } = {},
): Promise<MonthlyRunResult> {
  const today = todayKey();
  const full = monthRange(monthKey);
  const days = daysElapsed(monthKey, today);
  if (days <= 0) throw new Error('这个月还没开始，没有可总结的内容');

  const isPartial = days < Number(full.end.slice(8, 10));
  const rangeStart = dateKeyOf(monthKey, 1);
  const rangeEnd = dateKeyOf(monthKey, days);

  const plan = await planDistill(monthKey);
  const { segments, stats } = await runDistill(plan);

  const entries = await db.entries.where('date').between(rangeStart, rangeEnd, true, true).count();
  const missingDays = Math.max(0, days - entries);

  const prev = await db.monthlyReports.get(shiftMonth(monthKey, -1));

  const { data, usage } = await chatJson<unknown>({
    messages: monthSummaryPrompt.build({
      segments,
      rangeStart,
      rangeEnd,
      isPartial,
      missingDays,
      prevMonth: prev ?? null,
    }),
    temperature: monthSummaryPrompt.temperature,
  });

  const report: MonthlyReport = {
    id: newId(),
    monthKey,
    rangeStart,
    rangeEnd,
    isPartial,
    coveredSegments: segments.map((s) => s.segIndex),
    layers: normalizeLayers(data),
    generatedAt: Date.now(),
    promptVersion: promptTag(monthSummaryPrompt.id, monthSummaryPrompt.version),
    syncStatus: 'pending',
  };

  await track('monthly_report_generated', {
    monthKey,
    totalSegments: stats.totalSegments,
    called: stats.called,
    skipped: stats.skipped,
    failed: stats.failed,
    emptySegments: stats.emptySegments,
    distillTokens: stats.totalTokens,
    reduceTokens: usage?.total_tokens ?? 0,
    totalTokens: (usage?.total_tokens ?? 0) + stats.totalTokens,
    chars: REPORT_LAYER_KEYS.reduce(
      (n, k) => n + (typeof report.layers[k] === 'string' ? report.layers[k].length : 0),
      0,
    ),
  });

  let synced = false;
  let syncError: string | undefined;
  if (options.sync !== false) {
    try {
      const store = await activeStore();
      const result = await store.putMonthly(report);
      report.syncStatus = 'synced';
      report.syncRef = result.ref;
      synced = true;
    } catch (err) {
      report.syncStatus = 'failed';
      syncError = (err as Error).message;
    }
  }

  await db.monthlyReports.put(report);
  return { report, stats, reduceTokens: usage?.total_tokens ?? 0, synced, syncError };
}

export async function listMonthlyReports(): Promise<MonthlyReport[]> {
  const list = await db.monthlyReports.toArray();
  return list.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

export async function listYearlyReports(): Promise<YearlyReport[]> {
  const list = await db.yearlyReports.toArray();
  return list.sort((a, b) => b.generatedAt - a.generatedAt);
}

export interface YearlyRunResult {
  report: YearlyReport;
  reduceTokens: number;
  synced: boolean;
  syncError?: string;
}

export async function generateYearlyReport(
  scope: YearlyScope,
  yearKey?: string,
  options: { sync?: boolean } = {},
): Promise<YearlyRunResult> {
  const all = await db.monthlyReports.toArray();
  const reports =
    scope === 'career'
      ? all
      : all.filter((r) => r.monthKey.startsWith(`${yearKey}-`));

  if (reports.length === 0) {
    throw new Error(
      scope === 'career'
        ? '还没有任何月报，先至少生成一份月报'
        : `${yearKey} 年还没有月报`,
    );
  }
  reports.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const { data, usage } = await chatJson<unknown>({
    messages: yearRollupPrompt.build({
      reports,
      scope,
      rangeStart: reports[0].rangeStart,
      rangeEnd: reports[reports.length - 1].rangeEnd,
      maxChars: YEAR_REPORT_MAX_CHARS,
    }),
    temperature: yearRollupPrompt.temperature,
  });

  const report: YearlyReport = {
    id: newId(),
    scope,
    yearKey,
    rangeStart: reports[0].rangeStart,
    rangeEnd: reports[reports.length - 1].rangeEnd,
    sourceMonthKeys: reports.map((r) => r.monthKey),
    layers: normalizeLayers(data),
    generatedAt: Date.now(),
    promptVersion: promptTag(yearRollupPrompt.id, yearRollupPrompt.version),
    syncStatus: 'pending',
  };

  let synced = false;
  let syncError: string | undefined;
  if (options.sync !== false) {
    try {
      const store = await activeStore();
      const result = await store.putYearly(report);
      report.syncStatus = 'synced';
      report.syncRef = result.ref;
      synced = true;
    } catch (err) {
      report.syncStatus = 'failed';
      syncError = (err as Error).message;
    }
  }

  await db.yearlyReports.put(report);
  await track('yearly_report_generated', {
    scope,
    yearKey: yearKey ?? '',
    sourceMonths: reports.length,
    totalTokens: usage?.total_tokens ?? 0,
  });

  return { report, reduceTokens: usage?.total_tokens ?? 0, synced, syncError };
}

export function reportCharCount(report: MonthlyReport): number {
  return REPORT_LAYER_KEYS.reduce((n, k) => n + (report.layers[k]?.length ?? 0), 0);
}

export { MONTH_REPORT_MAX_CHARS };
