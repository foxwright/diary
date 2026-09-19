import { extractPrompt, promptTag } from '../prompts';
import type { Fields } from '../types';
import { emptyFields, normalizeFields } from './fields';
import { chatJson, LlmError, type Usage } from './llm';

export interface StructuredOutcome {
  fields: Fields;
  /** true 表示 LLM 没跑通，已降级为「保留原文 + 字段留空」 */
  degraded: boolean;
  error?: string;
  usage?: Usage;
  promptVersion: string;
}

/** 路径 B：自由输入 → 六字段。永不抛错（除主动取消），失败即降级。 */
export async function extractFields(text: string): Promise<StructuredOutcome> {
  const promptVersion = promptTag(extractPrompt.id, extractPrompt.version);
  try {
    const { data, usage } = await chatJson<unknown>({
      messages: extractPrompt.build({ text }),
      temperature: extractPrompt.temperature,
    });
    return {
      fields: normalizeFields(data, 'extracted'),
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
