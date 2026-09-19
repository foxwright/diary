import type { DistillSegment, MonthlyReport } from '../types';
import type { PromptModule } from './types';

export const MONTH_SUMMARY_ID = 'month-summary';
export const MONTH_SUMMARY_VERSION = '1.0';

export const MONTH_REPORT_MAX_CHARS = 800;

const SYSTEM = `你是复盘助手。基于一个月的周蒸馏结果，生成四层月报。

四层结构，合计不超过 800 字：
- behavior 行为层：这个月做了什么、学了什么
- todo 待办层：接下来要做什么。必须可执行，禁止"继续加油"这类空话
- cognition 认知层：这个人身上反复出现的规律、他自己可能没察觉的模式、可复用的心得
- guidance 指导层：你针对本月内容提出的具体建议，最多 3 条，每条必须具体到动作

硬约束（违反即失败）：
1. 禁止输出流水。"1 号做了 A、2 号做了 B"是统计，不是洞察。
2. cognition 是全篇价值最高的一层。如果确实没发现规律，如实写"本月没有观察到明显规律"，不要硬凑。
3. guidance 里禁止出现"建议你多反思""可以尝试……"这类没有动作的建议。
4. 周期内有无记录的天数，如实陈述为事实，不做评价、不表达遗憾。
5. 不要重复周蒸馏里已经说过的原话，要做更高一层的抽象。

输出严格 JSON，不要 markdown 代码块：
{"behavior": "...", "todo": "...", "cognition": "...", "guidance": "..."}`;

function renderSegment(seg: DistillSegment): string {
  return [
    `第 ${seg.segIndex} 段（${seg.from} 到 ${seg.to}）`,
    `做了什么：${seg.content.actions}`,
    `学了什么：${seg.content.learnings}`,
    `未了结：${seg.content.pending}`,
    `苗头：${seg.content.signals}`,
  ].join('\n');
}

function renderPrevMonth(prev: MonthlyReport | null): string {
  if (!prev) return '';
  return `\n\n上月（${prev.monthKey}）月报，供你判断变化，不要复述它：\n${JSON.stringify(prev.layers)}`;
}

export interface MonthSummaryArgs {
  segments: DistillSegment[];
  rangeStart: string;
  rangeEnd: string;
  isPartial: boolean;
  missingDays: number;
  prevMonth: MonthlyReport | null;
}

export const monthSummaryPrompt: PromptModule<MonthSummaryArgs> = {
  id: MONTH_SUMMARY_ID,
  version: MONTH_SUMMARY_VERSION,
  temperature: 0.5,
  build: ({ segments, rangeStart, rangeEnd, isPartial, missingDays, prevMonth }) => {
    const partialNote = isPartial
      ? `注意：本月尚未结束，只覆盖到 ${rangeEnd}，请在 behavior 开头标注这一点。`
      : '';
    return [
      { role: 'system', content: `${SYSTEM}\n\n${partialNote}`.trim() },
      {
        role: 'user',
        content: `覆盖 ${rangeStart} 到 ${rangeEnd}，其中 ${missingDays} 天没有记录。\n\n${segments
          .map(renderSegment)
          .join('\n\n')}${renderPrevMonth(prevMonth)}`,
      },
    ];
  },
};
