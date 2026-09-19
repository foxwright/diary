import { dateKeyOf } from './date';

export interface Segment {
  /** 1-based 段序号 */
  index: number;
  /** 起止日（月内第几天，1-based，含首尾） */
  fromDay: number;
  toDay: number;
  len: number;
}

export interface DatedSegment extends Segment {
  from: string;
  to: string;
}

/**
 * 段数规则：向下取整，13 天及以下 1 个，14–20 天 2 个，21–27 天 3 个，28 天及以上 4 个。
 * 段内切分：均分，余数全部并入最后一段。
 */
export function planSegments(days: number): Segment[] {
  if (days <= 0) return [];
  const n = Math.min(4, Math.max(1, Math.floor(days / 7)));
  const base = Math.floor(days / n);
  const rem = days - base * n;

  const out: Segment[] = [];
  let start = 1;
  for (let i = 0; i < n; i++) {
    const len = base + (i === n - 1 ? rem : 0);
    out.push({ index: i + 1, fromDay: start, toDay: start + len - 1, len });
    start += len;
  }
  return out;
}

export function planSegmentsForMonth(monthKey: string, days: number): DatedSegment[] {
  return planSegments(days).map((s) => ({
    ...s,
    from: dateKeyOf(monthKey, s.fromDay),
    to: dateKeyOf(monthKey, s.toDay),
  }));
}
