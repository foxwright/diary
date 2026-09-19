import { db } from '../db';
import { weekDistillPrompt, promptTag } from '../prompts';
import type { DistillSegment, Entry } from '../types';
import { daysElapsed } from './date';
import { listEntriesBetween } from './entries';
import { segmentFingerprint } from './fingerprint';
import { newId } from './id';
import { asString } from './json';
import { chatJson, LlmError, type Usage } from './llm';
import { planSegmentsForMonth, type DatedSegment } from './planner';

const EMPTY_CONTENT = {
  actions: '无',
  learnings: '无',
  pending: '无',
  signals: '无',
};

export interface DistillPlanItem {
  segment: DatedSegment;
  entries: Entry[];
  fingerprint: string;
  /** 命中缓存且指纹一致时非空 */
  cached: DistillSegment | null;
}

export interface DistillFailure {
  segIndex: number;
  error: string;
}

export interface DistillStats {
  totalSegments: number;
  skipped: number;
  called: number;
  failed: number;
  emptySegments: number;
  totalTokens: number;
  failures: DistillFailure[];
}

export async function planDistill(
  monthKey: string,
  today?: string,
): Promise<DistillPlanItem[]> {
  const days = daysElapsed(monthKey, today);
  const segments = planSegmentsForMonth(monthKey, days);
  const existing = await db.segments.where('monthKey').equals(monthKey).toArray();
  const byIndex = new Map(existing.map((s) => [s.segIndex, s]));

  const plan: DistillPlanItem[] = [];
  for (const segment of segments) {
    const entries = await listEntriesBetween(segment.from, segment.to);
    const fingerprint = segmentFingerprint(entries);
    const found = byIndex.get(segment.index) ?? null;
    plan.push({
      segment,
      entries,
      fingerprint,
      cached: found && found.fingerprint === fingerprint ? found : null,
    });
  }
  return plan;
}

async function distillOne(item: DistillPlanItem): Promise<{
  segment: DistillSegment;
  usage?: Usage;
}> {
  const { data, usage } = await chatJson<Record<string, unknown>>({
    messages: weekDistillPrompt.build({
      from: item.segment.from,
      to: item.segment.to,
      entries: item.entries,
    }),
    temperature: weekDistillPrompt.temperature,
  });

  const segment: DistillSegment = {
    id: newId(),
    monthKey: item.segment.from.slice(0, 7),
    segIndex: item.segment.index,
    from: item.segment.from,
    to: item.segment.to,
    fingerprint: item.fingerprint,
    content: {
      actions: asString(data.actions).trim() || '无',
      learnings: asString(data.learnings).trim() || '无',
      pending: asString(data.pending).trim() || '无',
      signals: asString(data.signals).trim() || '无',
    },
    generatedAt: Date.now(),
    promptVersion: promptTag(weekDistillPrompt.id, weekDistillPrompt.version),
  };
  return { segment, usage };
}

function makeEmptySegment(item: DistillPlanItem): DistillSegment {
  return {
    id: newId(),
    monthKey: item.segment.from.slice(0, 7),
    segIndex: item.segment.index,
    from: item.segment.from,
    to: item.segment.to,
    fingerprint: item.fingerprint,
    content: { ...EMPTY_CONTENT },
    generatedAt: Date.now(),
    promptVersion: 'none@0',
  };
}

/**
 * Map 阶段：并行蒸馏。已缓存且指纹未变的段直接跳过，不重复花钱。
 * 单段失败不中断其他段（Promise.allSettled）。
 */
export async function runDistill(plan: DistillPlanItem[]): Promise<{
  segments: DistillSegment[];
  stats: DistillStats;
}> {
  const stats: DistillStats = {
    totalSegments: plan.length,
    skipped: 0,
    called: 0,
    failed: 0,
    emptySegments: 0,
    totalTokens: 0,
    failures: [],
  };

  const results: DistillSegment[] = [];
  const pending: DistillPlanItem[] = [];

  for (const item of plan) {
    if (item.cached) {
      stats.skipped += 1;
      results.push(item.cached);
      continue;
    }
    if (item.entries.length === 0) {
      stats.emptySegments += 1;
      const empty = makeEmptySegment(item);
      await db.segments.put(empty);
      results.push(empty);
      continue;
    }
    pending.push(item);
  }

  const settled = await Promise.allSettled(pending.map((item) => distillOne(item)));

  settled.forEach((outcome, i) => {
    const item = pending[i];
    if (outcome.status === 'fulfilled') {
      stats.called += 1;
      if (outcome.value.usage) stats.totalTokens += outcome.value.usage.total_tokens ?? 0;
      results.push(outcome.value.segment);
    } else {
      stats.failed += 1;
      const err = outcome.reason as LlmError;
      stats.failures.push({
        segIndex: item.segment.index,
        error: err?.message ?? String(outcome.reason),
      });
      // 失败的段仍然落一条标记记录，月报里会显示该段缺失
      const missing: DistillSegment = {
        id: newId(),
        monthKey: item.segment.from.slice(0, 7),
        segIndex: item.segment.index,
        from: item.segment.from,
        to: item.segment.to,
        fingerprint: item.fingerprint,
        content: {
          actions: '该段蒸馏失败，数据缺失',
          learnings: '该段蒸馏失败，数据缺失',
          pending: '该段蒸馏失败，数据缺失',
          signals: '该段蒸馏失败，数据缺失',
        },
        generatedAt: Date.now(),
        promptVersion: 'failed@0',
      };
      results.push(missing);
    }
  });

  const fresh = results.filter((s) => !s.promptVersion.startsWith('failed@'));
  if (fresh.length) await db.segments.bulkPut(fresh);

  results.sort((a, b) => a.segIndex - b.segIndex);
  return { segments: results, stats };
}

export async function getSegmentsForMonth(monthKey: string): Promise<DistillSegment[]> {
  const list = await db.segments.where('monthKey').equals(monthKey).toArray();
  return list.sort((a, b) => a.segIndex - b.segIndex);
}

/** 预览：这个月要派几个子代理、切哪几段、能跳过几段 */
export async function previewPlan(monthKey: string) {
  const plan = await planDistill(monthKey);
  return {
    segments: plan.map((p) => ({
      index: p.segment.index,
      from: p.segment.from,
      to: p.segment.to,
      entryCount: p.entries.length,
      willSkip: p.cached !== null,
    })),
    toCall: plan.filter((p) => !p.cached && p.entries.length > 0).length,
    toSkip: plan.filter((p) => p.cached !== null).length,
  };
}
