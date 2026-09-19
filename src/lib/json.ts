/**
 * 从 LLM 返回的文本里抠出 JSON 对象。
 * 容错顺序：直接 parse → 去 ```json 围栏 → 截取首个 { 到末个 }。
 */
export function parseJsonLoose<T>(raw: string): T | null {
  const text = raw.trim();
  if (!text) return null;

  const attempts: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(text.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed as T;
    } catch {
      // 继续尝试下一种
    }
  }
  return null;
}

export function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).map((s) => s.trim()).filter(Boolean);
  }
  const single = asString(value).trim();
  return single ? [single] : [];
}
