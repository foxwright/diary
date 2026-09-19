import { db } from '../db';
import type { Entry } from '../types';
import { FIELD_KEYS } from '../types';
import { eachDate, monthKeyOf, parseDate, todayKey } from './date';

export interface MetricCard {
  key: string;
  label: string;
  display: string;
  target: string;
  /** null 表示无绝对目标，只看分布 */
  ok: boolean | null;
  note: string;
}

export interface MetricsBundle {
  cards: MetricCard[];
  totals: {
    entries: number;
    days: number;
    monthReports: number;
    yearReports: number;
    llmCalls: number;
    totalTokens: number;
  };
}

function pct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${((n / d) * 100).toFixed(0)}%`;
}

export async function computeMetrics(): Promise<MetricsBundle> {
  const [entries, monthlyReports, yearlyReports, events] = await Promise.all([
    db.entries.toArray(),
    db.monthlyReports.toArray(),
    db.yearlyReports.toArray(),
    db.events.toArray(),
  ]);

  const sorted: Entry[] = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const dateSet = new Set(sorted.map((e) => e.date));
  const today = todayKey();

  // 1 · 7 日连续率：从第一条记录那天起算 7 天窗口
  let sevenDayRate = 0;
  if (sorted.length > 0) {
    const start = sorted[0].date;
    const window = eachDate(start, addDays(start, 6));
    const hit = window.filter((d) => dateSet.has(d)).length;
    sevenDayRate = hit / 7;
  }

  // 2 · 次日回访率：有记录的第 N 天里，N+1 天也有记录的比例
  const daysList = [...dateSet].sort();
  const returnPairs = daysList.filter((d) => d < today);
  const returned = returnPairs.filter((d) => dateSet.has(addDays(d, 1))).length;

  // 3 · 路径分布
  const modeCount: Record<string, number> = { framework: 0, freeform: 0, dialog: 0 };
  for (const e of sorted) modeCount[e.inputMode] = (modeCount[e.inputMode] ?? 0) + 1;
  const modeText = sorted.length
    ? `框架 ${pct(modeCount.framework, sorted.length)} / 自由 ${pct(modeCount.freeform, sorted.length)} / 对话 ${pct(modeCount.dialog, sorted.length)}`
    : '—';

  // 4 · 确认修改率
  let filled = 0;
  let edited = 0;
  for (const e of sorted) {
    for (const k of FIELD_KEYS) {
      const f = e.fields[k];
      if (!f) continue;
      filled += 1;
      if (f.source === 'user_edited') edited += 1;
    }
  }

  // 5 · 对话轮次
  const dialogTurns = events.filter((e) => e.type === 'dialog_turn').length;
  const dialogSessions = sorted.filter((e) => e.inputMode === 'dialog').length;

  // 6 · 字段填充率
  const fillRate = sorted.length ? filled / (sorted.length * FIELD_KEYS.length) : 0;

  // 7 · 月报生成率
  const firstDate = sorted[0]?.date ?? null;
  let expectedMonths = 0;
  if (firstDate) {
    const cursor = new Date(parseDate(firstDate));
    cursor.setDate(1);
    const endMonth = monthKeyOf(today);
    let key = monthKeyOf(firstDate);
    while (key <= endMonth) {
      expectedMonths += 1;
      cursor.setMonth(cursor.getMonth() + 1);
      key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      if (expectedMonths > 600) break;
    }
  }

  // 8 · 蒸馏复用率（从月报生成事件汇总）
  const genEvents = events.filter((e) => e.type === 'monthly_report_generated');
  const totalSeg = genEvents.reduce(
    (n, e) => n + (typeof e.payload.totalSegments === 'number' ? e.payload.totalSegments : 0),
    0,
  );
  const skippedSeg = genEvents.reduce(
    (n, e) => n + (typeof e.payload.skipped === 'number' ? e.payload.skipped : 0),
    0,
  );

  // 年报生成率
  const yearsWithEntries = new Set(sorted.map((e) => e.date.slice(0, 4)));
  const yearsWithReports = new Set(
    yearlyReports.filter((r) => r.scope === 'year' && r.yearKey).map((r) => r.yearKey as string),
  );

  const llmCalls = events.filter((e) => typeof e.payload.totalTokens === 'number').length;
  const totalTokens = events.reduce(
    (n, e) => n + (typeof e.payload.totalTokens === 'number' ? e.payload.totalTokens : 0),
    0,
  );

  const sevenOk = sorted.length === 0 ? null : sevenDayRate >= 5 / 7;
  const returnOk = returnPairs.length === 0 ? null : returned / returnPairs.length >= 0.6;
  const editRate = filled ? edited / filled : 0;

  const cards: MetricCard[] = [
    {
      key: 'sevenDayRate',
      label: '7 日连续率',
      display: sorted.length ? `${(sevenDayRate * 7).toFixed(1)} / 7 天` : '—',
      target: '≥ 5/7',
      ok: sevenOk,
      note: '核心命题的前置条件。从第一条记录起算 7 天窗口',
    },
    {
      key: 'returnRate',
      label: '次日回访率',
      display: pct(returned, returnPairs.length),
      target: '≥ 60%',
      ok: returnOk,
      note: '有记录的第 N 天里，第 N+1 天也来写的比例',
    },
    {
      key: 'modeMix',
      label: '路径分布',
      display: modeText,
      target: '看分布，无阈值',
      ok: null,
      note: '用户到底卡在哪一步：框架 / 自由 / 对话',
    },
    {
      key: 'editRate',
      label: '确认修改率',
      display: filled ? pct(edited, filled) : '—',
      target: '< 40%',
      ok: filled ? editRate < 0.4 : null,
      note: '抽取与对话整理的质量。越低说明 AI 整理得越准',
    },
    {
      key: 'dialogTurns',
      label: '对话轮次',
      display: dialogSessions ? (dialogTurns / dialogSessions).toFixed(1) : '—',
      target: '3–6 轮',
      ok: null,
      note: '路径 C 平均轮次。过低说明问得不够，过高说明问得烦',
    },
    {
      key: 'fillRate',
      label: '字段填充率',
      display: sorted.length ? pct(filled, sorted.length * FIELD_KEYS.length) : '—',
      target: '≥ 60%',
      ok: sorted.length ? fillRate >= 0.6 : null,
      note: '记录是否有实质内容，而不是空条目',
    },
    {
      key: 'monthRate',
      label: '月报生成率',
      display: expectedMonths ? pct(monthlyReports.length, expectedMonths) : '—',
      target: '≥ 80%',
      ok: expectedMonths ? monthlyReports.length / expectedMonths >= 0.8 : null,
      note: '蒸馏与月报有没有被真的用起来',
    },
    {
      key: 'distillReuse',
      label: '蒸馏复用率',
      display: totalSeg ? pct(skippedSeg, totalSeg) : '—',
      target: '越高越好',
      ok: null,
      note: '周级缓存是否生效。每次都 0% 说明在重复烧钱',
    },
    {
      key: 'yearRate',
      label: '年报生成率',
      display: yearsWithEntries.size ? pct(yearsWithReports.size, yearsWithEntries.size) : '—',
      target: '≥ 50%',
      ok: yearsWithEntries.size ? yearsWithReports.size / yearsWithEntries.size >= 0.5 : null,
      note: '长期价值是否被兑现',
    },
  ];

  return {
    cards,
    totals: {
      entries: sorted.length,
      days: dateSet.size,
      monthReports: monthlyReports.length,
      yearReports: yearlyReports.length,
      llmCalls,
      totalTokens,
    },
  };
}

function addDays(dateKey: string, n: number): string {
  const d = parseDate(dateKey);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function exportAll(): Promise<string> {
  const [entries, segments, monthly, yearly, settings] = await Promise.all([
    db.entries.toArray(),
    db.segments.toArray(),
    db.monthlyReports.toArray(),
    db.yearlyReports.toArray(),
    db.settings.toArray(),
  ]);
  const safeSettings = settings.map((s) => ({
    ...s,
    apiKey: s.apiKey ? '***（已省略）' : '',
    imaApiKey: s.imaApiKey ? '***（已省略）' : '',
  }));
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: 1,
      entries,
      segments,
      monthlyReports: monthly,
      yearlyReports: yearly,
      settings: safeSettings,
    },
    null,
    2,
  );
}

export function downloadText(fileName: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function exportEntriesMarkdown(): Promise<string> {
  const entries = await db.entries.orderBy('date').toArray();
  const { FIELD_META } = await import('../types');
  const blocks = entries.map((e) => {
    const lines = [`## ${e.date}`];
    for (const meta of FIELD_META) {
      const f = e.fields[meta.key];
      if (!f) continue;
      const v = Array.isArray(f.value) ? f.value.map((x, i) => `${i + 1}. ${x}`).join('\n') : f.value;
      lines.push(`**${meta.label}**\n\n${v}`);
    }
    if (e.rawText.trim()) lines.push(`**原始输入**\n\n${e.rawText.trim()}`);
    return lines.join('\n\n');
  });
  return `# 日记全量导出\n\n导出时间：${new Date().toLocaleString('zh-CN')}\n\n${blocks.join('\n\n---\n\n')}\n`;
}
