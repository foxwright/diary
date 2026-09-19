export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return fmtDate(new Date());
}

export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function dateKeyOf(monthKey: string, day: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return fmtDate(new Date(y, m - 1, day));
}

export function monthRange(monthKey: string): { start: string; end: string } {
  return {
    start: dateKeyOf(monthKey, 1),
    end: dateKeyOf(monthKey, daysInMonth(monthKey)),
  };
}

/**
 * 该月已经过去的天数。
 * - 月份早于当前月 → 整月天数
 * - 月份晚于当前月 → 0
 * - 就是当前月 → 今天是几号
 */
export function daysElapsed(monthKey: string, today: string = todayKey()): number {
  const todayMonth = monthKeyOf(today);
  if (monthKey < todayMonth) return daysInMonth(monthKey);
  if (monthKey > todayMonth) return 0;
  return Number(today.slice(8, 10));
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 把日期范围内每一天的 key 列出来（含首尾） */
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  const cursor = parseDate(from);
  const end = parseDate(to);
  while (cursor <= end) {
    out.push(fmtDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

export function formatDateLabel(dateKey: string): string {
  const d = parseDate(dateKey);
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${Number(dateKey.slice(5, 7))} 月 ${Number(dateKey.slice(8, 10))} 日 · 周${week}`;
}
