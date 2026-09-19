import type { Confidence, Field, FieldSource, Fields } from '../types';
import { FIELD_KEYS, FIELD_META } from '../types';
import { asString, asStringArray } from './json';

export function emptyFields(): Fields {
  return {
    goal: null,
    state: null,
    actions: null,
    feedback: null,
    reflection: null,
    other: null,
  };
}

function normalizeConfidence(value: unknown): Confidence {
  return value === 'high' || value === 'mid' || value === 'low' ? value : 'mid';
}

function normalizeOne(raw: unknown, multi: boolean, source: FieldSource): Field | null {
  if (raw === null || raw === undefined) return null;

  const container =
    typeof raw === 'object' && raw !== null && 'value' in (raw as Record<string, unknown>)
      ? (raw as { value: unknown; confidence?: unknown })
      : { value: raw, confidence: undefined };

  if (multi) {
    const list = asStringArray(container.value);
    if (list.length === 0) return null;
    return { value: list, confidence: normalizeConfidence(container.confidence), source };
  }

  const text = asString(container.value).trim();
  if (!text) return null;
  return { value: text, confidence: normalizeConfidence(container.confidence), source };
}

/**
 * 把 LLM 返回的对象规范成 Fields。
 * 兼容两种形状：{ fields: {...} } 与直接 {...}。
 * 空值一律留 null —— 宁可留空，不硬填。
 */
export function normalizeFields(raw: unknown, source: FieldSource): Fields {
  const out = emptyFields();
  if (!raw || typeof raw !== 'object') return out;

  const record = raw as Record<string, unknown>;
  const bag =
    record.fields && typeof record.fields === 'object'
      ? (record.fields as Record<string, unknown>)
      : record;

  for (const meta of FIELD_META) {
    out[meta.key] = normalizeOne(bag[meta.key], meta.multi, source);
  }
  return out;
}

export function isFieldsEmpty(fields: Fields): boolean {
  return FIELD_KEYS.every((k) => fields[k] === null);
}

export function filledFieldCount(fields: Fields): number {
  return FIELD_KEYS.filter((k) => fields[k] !== null).length;
}

export function hasAnyValue(fields: Fields): boolean {
  return !isFieldsEmpty(fields);
}

export function setFieldValue(
  fields: Fields,
  key: keyof Fields,
  value: string | string[],
): Fields {
  const trimmed = Array.isArray(value)
    ? value.map((v) => v.trim()).filter(Boolean)
    : value.trim();

  const isEmpty = Array.isArray(trimmed) ? trimmed.length === 0 : trimmed === '';
  const next: Fields = { ...fields };
  if (isEmpty) {
    next[key] = null;
    return next;
  }
  const prev = fields[key];
  next[key] = {
    value: trimmed,
    confidence: prev?.confidence ?? 'high',
    source: 'user_edited',
    editedAt: Date.now(),
  };
  return next;
}
