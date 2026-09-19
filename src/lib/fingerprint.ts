export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * 段指纹：段内所有条目的 id + updatedAt。
 * 只要有一条被改动，指纹就变，该段就需要重新蒸馏。
 */
export function segmentFingerprint(
  entries: { id: string; updatedAt: number }[],
): string {
  if (entries.length === 0) return hashString('empty');
  const parts = entries.map((e) => `${e.id}:${e.updatedAt}`).sort();
  return hashString(parts.join('|'));
}
