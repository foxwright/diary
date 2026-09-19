import type { DialogTurn } from '../types';
import type { PromptModule } from './types';

export const DIALOG_SUMMARIZE_ID = 'dialog-summarize';
export const DIALOG_SUMMARIZE_VERSION = '1.0';

const SYSTEM = `把下面这段对话整理成日记的固定框架。对话是用户与助手的问答。

框架字段：goal 目标 / state 今日状态 / actions 具体行动 / feedback 正反馈成果 /
reflection 经验总结反思 / other 其他（情绪细节、人际关系、身体状况）

规则：
1. 只使用对话中用户自己说出的信息。助手的引导语、推测、建议都不要写进去。
2. 用用户的措辞，改写成第一人称。不要润色成书面语。
3. 无法确定的字段返回 null。禁止推测补全。
4. 字段允许稀疏。

输出严格 JSON，不要 markdown 代码块：
{
  "fields": {
    "goal": {"value": "字符串", "confidence": "high|mid|low"},
    "state": {"value": "字符串", "confidence": "high|mid|low"},
    "actions": {"value": ["字符串"], "confidence": "high|mid|low"},
    "feedback": {"value": "字符串", "confidence": "high|mid|low"},
    "reflection": {"value": "字符串", "confidence": "high|mid|low"},
    "other": {"value": "字符串", "confidence": "high|mid|low"}
  }
}
没有内容的字段直接写 null。`;

export const dialogSummarizePrompt: PromptModule<{ turns: DialogTurn[] }> = {
  id: DIALOG_SUMMARIZE_ID,
  version: DIALOG_SUMMARIZE_VERSION,
  temperature: 0.2,
  build: ({ turns }) => [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: turns
        .map((t) => `${t.role === 'user' ? '用户' : '助手'}：${t.content}`)
        .join('\n'),
    },
  ],
};
