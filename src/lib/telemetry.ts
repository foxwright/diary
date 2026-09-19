import { db, loadSettings } from '../db';
import type { EventType } from '../types';
import { newId } from './id';

const FORBIDDEN_KEYS = ['apikey', 'api_key', 'authorization', 'key'];

function sanitize(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (FORBIDDEN_KEYS.includes(k.toLowerCase())) continue;
    out[k] =
      typeof v === 'string' && v.length > 400 ? `${v.slice(0, 400)}…` : v;
  }
  return out;
}

/** 埋点只写本机，永不上报。失败绝不打断主流程。 */
export async function track(
  type: EventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const settings = await loadSettings();
    if (!settings.telemetryEnabled) return;
    await db.events.add({
      id: newId(),
      ts: Date.now(),
      type,
      payload: sanitize(payload),
    });
  } catch {
    // 埋点失败静默
  }
}

/** 统计某类事件的实际 token 消耗，供成本监控使用 */
export async function sumTokensBetween(fromTs: number, toTs: number): Promise<number> {
  const events = await db.events.where('ts').between(fromTs, toTs, true, true).toArray();
  return events.reduce((acc, e) => {
    const t = e.payload?.totalTokens;
    return acc + (typeof t === 'number' ? t : 0);
  }, 0);
}

export async function countCallsBetween(fromTs: number, toTs: number): Promise<number> {
  const events = await db.events.where('ts').between(fromTs, toTs, true, true).toArray();
  return events.filter((e) => typeof e.payload?.totalTokens === 'number').length;
}
