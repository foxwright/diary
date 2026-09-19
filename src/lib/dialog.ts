import { dialogGuidePrompt, dialogSummarizePrompt, promptTag } from '../prompts';
import type { DialogTurn } from '../types';
import { emptyFields, normalizeFields } from './fields';
import { chatJson, LlmError, type Usage } from './llm';
import type { StructuredOutcome } from './extract';

export const MAX_DIALOG_TURNS = 6;

export interface GuideStep {
  say: string;
  end: boolean;
}

/** 路径 C：跑一轮引导。失败时返回一句兜底话术，不阻断对话。 */
export async function guideNext(
  turns: DialogTurn[],
  turn: number,
  maxTurns: number = MAX_DIALOG_TURNS,
): Promise<{ step: GuideStep; usage?: Usage }> {
  try {
    const { data, usage } = await chatJson<{ say?: unknown; end?: unknown }>({
      messages: dialogGuidePrompt.build({ turns, turn, maxTurns }),
      temperature: dialogGuidePrompt.temperature,
    });
    const say = typeof data.say === 'string' ? data.say.trim() : '';
    const end = data.end === true;
    return { step: { say, end: end && true }, usage };
  } catch (err) {
    const e = err as LlmError;
    if (e.kind === 'aborted') throw err;
    return {
      step: {
        say: '刚才没接上话。你接着说，我在听。',
        end: false,
      },
    };
  }
}

/** 路径 C 收尾：把整段对话整理成六字段。与路径 B 同样永不阻断。 */
export async function summarizeDialog(turns: DialogTurn[]): Promise<StructuredOutcome> {
  const promptVersion = promptTag(dialogSummarizePrompt.id, dialogSummarizePrompt.version);
  try {
    const { data, usage } = await chatJson<unknown>({
      messages: dialogSummarizePrompt.build({ turns }),
      temperature: dialogSummarizePrompt.temperature,
    });
    return {
      fields: normalizeFields(data, 'dialog_extracted'),
      degraded: false,
      usage,
      promptVersion,
    };
  } catch (err) {
    const e = err as LlmError;
    if (e.kind === 'aborted') throw err;
    return {
      fields: emptyFields(),
      degraded: true,
      error: e.message ?? String(err),
      promptVersion,
    };
  }
}

export function userTurnsText(turns: DialogTurn[]): string {
  return turns
    .filter((t) => t.role === 'user')
    .map((t) => t.content.trim())
    .filter(Boolean)
    .join('\n\n');
}
