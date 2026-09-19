import type { ChatMessage } from '../lib/llm';
import type { DialogTurn } from '../types';
import type { PromptModule } from './types';

export const DIALOG_GUIDE_ID = 'dialog-guide';
export const DIALOG_GUIDE_VERSION = '1.0';

const SYSTEM = `你在帮一个"想记录但不知道写什么"的人把他今天说出来。

规则：
1. 一次只问一个方向。不要连问，不要把框架字段念一遍。
2. 从用户上一轮的回复里挑一个最具体的点往下追问，不要跳到新话题。
3. 语气像朋友随口接话，不像问卷。每句不超过 30 字。
4. 用户说"没了/就这样/差不多了/不想说了"或类似表达时，回 {"say": "", "end": true}。
5. 已经收集到足够信息（目标、状态、行动里至少两项有实质内容）时，主动回 {"say": "", "end": true}。

输出严格 JSON，不要 markdown 代码块：{"say": "这一轮要说的话", "end": false}`;

function renderTurns(turns: DialogTurn[]): string {
  return turns
    .map((t) => `${t.role === 'user' ? '他' : '你'}：${t.content}`)
    .join('\n');
}

export interface DialogGuideArgs {
  turns: DialogTurn[];
  turn: number;
  maxTurns: number;
}

export const dialogGuidePrompt: PromptModule<DialogGuideArgs> = {
  id: DIALOG_GUIDE_ID,
  version: DIALOG_GUIDE_VERSION,
  temperature: 0.6,
  build: ({ turns, turn, maxTurns }): ChatMessage[] => {
    const head = `这是对话的第 ${turn} 轮，最多 ${maxTurns} 轮。`;
    const body = turns.length
      ? `到目前为止的对话：\n${renderTurns(turns)}\n\n现在该你说下一句。`
      : '他刚刚点了"帮我问问自己"，还没有说任何内容。先抛一个最容易回答的开口问题。';
    return [
      { role: 'system', content: `${SYSTEM}\n\n${head}` },
      { role: 'user', content: body },
    ];
  },
};
