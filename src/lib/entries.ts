import { db } from '../db';
import type { DialogTurn, Entry, Fields, InputMode } from '../types';
import { todayKey } from './date';
import { emptyFields, filledFieldCount } from './fields';
import { newId } from './id';
import { track } from './telemetry';

export async function getEntryByDate(date: string): Promise<Entry | undefined> {
  return db.entries.where('date').equals(date).first();
}

export async function listEntriesDesc(limit?: number): Promise<Entry[]> {
  const query = db.entries.orderBy('date').reverse();
  return limit ? query.limit(limit).toArray() : query.toArray();
}

export async function listEntriesBetween(from: string, to: string): Promise<Entry[]> {
  return db.entries.where('date').between(from, to, true, true).toArray();
}

export interface SaveEntryInput {
  date?: string;
  inputMode: InputMode;
  rawText: string;
  dialog?: DialogTurn[];
  fields: Fields;
  promptVersion: string;
}

/**
 * 新建或并入当天条目。
 * rawText 为历史累积：新输入追加在原文之后，旧原文永不被覆盖。
 */
export async function saveEntry(input: SaveEntryInput): Promise<Entry> {
  const date = input.date ?? todayKey();
  const existing = await getEntryByDate(date);
  const now = Date.now();
  const incoming = input.rawText.trim();

  let rawText = incoming;
  if (existing?.rawText) {
    rawText =
      incoming && incoming !== existing.rawText.trim()
        ? `${existing.rawText}\n\n---\n\n${incoming}`
        : existing.rawText;
  }

  const entry: Entry = {
    id: existing?.id ?? newId(),
    date,
    inputMode: input.inputMode,
    rawText,
    dialog: input.dialog ?? existing?.dialog,
    fields: input.fields,
    confirmedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    promptVersion: input.promptVersion,
  };

  await db.entries.put(entry);
  await track('entry_save', {
    date,
    inputMode: input.inputMode,
    filledFields: filledFieldCount(entry.fields),
    hasDialog: Boolean(entry.dialog?.length),
    promptVersion: input.promptVersion,
  });
  return entry;
}

/** 只更新字段（确认页/条目详情页的就地编辑走这里） */
export async function updateEntryFields(
  id: string,
  fields: Fields,
  editedKeys: string[] = [],
): Promise<void> {
  const existing = await db.entries.get(id);
  if (!existing) return;
  await db.entries.put({ ...existing, fields, updatedAt: Date.now() });
  await track('field_edit', {
    date: existing.date,
    editedKeys,
    filledFields: filledFieldCount(fields),
  });
  // 字段变了，缓存过的周段蒸馏结果需要失效
  await invalidateSegmentsFor(existing.date);
}

export async function deleteEntry(id: string): Promise<void> {
  const existing = await db.entries.get(id);
  if (!existing) return;
  await db.entries.delete(id);
  await invalidateSegmentsFor(existing.date);
}

/** 删掉覆盖该日期的全部蒸馏缓存，让它下次重新蒸馏 */
async function invalidateSegmentsFor(date: string): Promise<void> {
  const monthKey = date.slice(0, 7);
  const segs = await db.segments.where('monthKey').equals(monthKey).toArray();
  const stale = segs.filter((s) => s.from <= date && date <= s.to).map((s) => s.id);
  if (stale.length) await db.segments.bulkDelete(stale);
}

export async function searchEntries(keyword: string): Promise<Entry[]> {
  const q = keyword.trim().toLowerCase();
  const all = await listEntriesDesc();
  if (!q) return all;
  return all.filter((e) => {
    if (e.rawText.toLowerCase().includes(q)) return true;
    if (e.dialog?.some((t) => t.content.toLowerCase().includes(q))) return true;
    return Object.values(e.fields).some((f) => {
      if (!f) return false;
      const v = Array.isArray(f.value) ? f.value.join(' ') : f.value;
      return v.toLowerCase().includes(q);
    });
  });
}

export async function entryStats() {
  const all = await db.entries.toArray();
  const dates = new Set(all.map((e) => e.date));
  return { total: all.length, uniqueDays: dates.size };
}

export { emptyFields };
