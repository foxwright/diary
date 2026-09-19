import type { MonthlyReport, YearlyScope } from '../types';
import type { PromptModule } from './types';

export const YEAR_ROLLUP_ID = 'year-rollup';
export const YEAR_ROLLUP_VERSION = '1.0';

export const YEAR_REPORT_MAX_CHARS = 1200;

const SYSTEM = `你是长期复盘助手。基于若干份月报，生成更高一层的汇报。

四层结构与月报完全一致，但抽象层级更高一级：
- behavior 行为层：这段时间的整体轨迹，做了什么、学了什么
- todo 待办层：接下来一个周期要做什么
- cognition 认知层：跨月重复出现的模式、这段时间真正站得住的心得
- guidance 指导层：具体建议，最多 3 条

硬约束：
1. 输入已经是压缩过的月报，不要再复述月报细节。做更高一层的抽象。
2. cognition 必须回答：这个人相比这段时间开始时，什么变了、什么没变。
3. 禁止流水、禁止空话、禁止评价性表述。

输出严格 JSON，不要 markdown 代码块：
{"behavior": "...", "todo": "...", "cognition": "...", "guidance": "..."}`;

function renderReport(r: MonthlyReport): string {
  return [
    `【${r.monthKey}】`,
    `行为层：${r.layers.behavior}`,
    `待办层：${r.layers.todo}`,
    `认知层：${r.layers.cognition}`,
    `指导层：${r.layers.guidance}`,
  ].join('\n');
}

export interface YearRollupArgs {
  reports: MonthlyReport[];
  scope: YearlyScope;
  rangeStart: string;
  rangeEnd: string;
  maxChars: number;
}

export const yearRollupPrompt: PromptModule<YearRollupArgs> = {
  id: YEAR_ROLLUP_ID,
  version: YEAR_ROLLUP_VERSION,
  temperature: 0.5,
  build: ({ reports, scope, rangeStart, rangeEnd, maxChars }) => {
    const scopeLabel = scope === 'career' ? '生涯汇报' : '年度汇报';
    return [
      { role: 'system', content: `${SYSTEM}\n\n篇幅上限 ${maxChars} 字。` },
      {
        role: 'user',
        content: `生成${scopeLabel}。覆盖 ${rangeStart} 到 ${rangeEnd}，共 ${reports.length} 个月。\n\n${reports
          .map(renderReport)
          .join('\n\n')}`,
      },
    ];
  },
};
