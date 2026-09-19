import type { Entry } from '../types';
import { FIELD_META } from '../types';
import type { PromptModule } from './types';

export const WEEK_DISTILL_ID = 'week-distill';
export const WEEK_DISTILL_VERSION = '1.0';

const SYSTEM = `你在为一份月报做前置蒸馏。输入是某人在一个时间段内的日记条目。

输出四小项，合计不超过 400 字：
- actions：做了什么（客观事实，合并同类项，不列流水）
- learnings：学了什么（新获得的知识、技能、信息）
- pending：未了结的事（提到但没结束的事，含明确的下一步）
- signals：值得上升为月度洞察的苗头（重复出现的行为、反复的情绪、未解的困惑）

规则：
1. 只依据输入内容。禁止推测、禁止评价、禁止建议。
2. 某项确实没有内容，就写"无"。不要为了填满而生成。
3. actions 要合并同类项：出现三次的同一件事写一次并标注频次，不要写三遍。

输出严格 JSON，不要 markdown 代码块：
{"actions": "...", "learnings": "...", "pending": "...", "signals": "..."}`;

export function renderEntryForPrompt(entry: Entry, rawLimit = 300): string {
  const lines: string[] = [`【${entry.date}】`];
  for (const meta of FIELD_META) {
    const field = entry.fields[meta.key];
    if (!field) continue;
    const value = Array.isArray(field.value) ? field.value.join('；') : field.value;
    if (!value.trim()) continue;
    lines.push(`${meta.label}：${value}`);
  }
  const raw = entry.rawText.trim();
  if (raw) {
    const cut = raw.length > rawLimit ? `${raw.slice(0, rawLimit)}…` : raw;
    lines.push(`原始记录：${cut}`);
  }
  return lines.join('\n');
}

export interface WeekDistillArgs {
  from: string;
  to: string;
  entries: Entry[];
}

export const weekDistillPrompt: PromptModule<WeekDistillArgs> = {
  id: WEEK_DISTILL_ID,
  version: WEEK_DISTILL_VERSION,
  temperature: 0.3,
  build: ({ from, to, entries }) => [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `${from} 到 ${to} 的日记条目（共 ${entries.length} 天）：\n\n${entries
        .map((e) => renderEntryForPrompt(e))
        .join('\n\n')}`,
    },
  ],
};
