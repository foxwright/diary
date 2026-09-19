import { loadSettings } from '../db';
import type { Settings } from '../types';
import { parseJsonLoose } from './json';

export type LlmErrorKind = 'no-key' | 'network' | 'http' | 'parse' | 'aborted';

export class LlmError extends Error {
  kind: LlmErrorKind;
  status?: number;

  constructor(kind: LlmErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
    this.status = status;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatResult {
  content: string;
  usage?: Usage;
}

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  /** 走 JSON mode */
  json?: boolean;
  signal?: AbortSignal;
  maxTokens?: number;
}

function endpointOf(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) throw new LlmError('http', 'baseURL 为空');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(
  opts: ChatOptions,
  settings: Settings,
): Promise<ChatResult> {
  if (!settings.apiKey) {
    throw new LlmError('no-key', '还没有填 API Key');
  }

  const body: Record<string, unknown> = {
    model: settings.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  let res: Response;
  try {
    res = await fetch(endpointOf(settings.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) {
      throw new LlmError('aborted', '已取消');
    }
    const hint =
      '请求发不出去。最常见的原因是模型厂商不允许浏览器直连（CORS），也可能是网络问题。';
    throw new LlmError('network', `${hint} 原始错误：${(err as Error).message}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const snippet = text.slice(0, 300);
    const hint =
      res.status === 401
        ? 'Key 无效或没权限。'
        : res.status === 402
          ? '余额不足。'
          : res.status === 404
            ? 'baseURL 或 model 名不对。'
            : res.status === 429
              ? '限流了，稍后重试。'
              : '';
    throw new LlmError('http', `HTTP ${res.status}。${hint} ${snippet}`, res.status);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: Usage;
  };
  const content = data.choices?.[0]?.message?.content ?? '';
  if (!content.trim()) {
    throw new LlmError('parse', '模型返回了空内容');
  }
  return { content, usage: data.usage };
}

/** 一次调用，失败自动重试一次（仅针对网络错误与可重试状态码） */
export async function chat(
  opts: ChatOptions,
  override?: Partial<Settings>,
): Promise<ChatResult> {
  const base = await loadSettings();
  const settings: Settings = { ...base, ...override, id: 'app' };

  try {
    return await requestOnce(opts, settings);
  } catch (err) {
    const e = err as LlmError;
    if (e.kind === 'aborted' || e.kind === 'no-key' || e.kind === 'parse') throw e;
    const retryable = e.kind === 'network' || (e.status !== undefined && isRetryable(e.status));
    if (!retryable) throw e;
    await sleep(800);
    return requestOnce(opts, settings);
  }
}

/** 要求返回 JSON 的调用；解析失败抛 LlmError('parse') */
export async function chatJson<T>(
  opts: ChatOptions,
  override?: Partial<Settings>,
): Promise<{ data: T; usage?: Usage }> {
  const { content, usage } = await chat({ ...opts, json: true }, override);
  const data = parseJsonLoose<T>(content);
  if (data === null) {
    throw new LlmError('parse', `模型没有返回合法 JSON。原始返回：${content.slice(0, 200)}`);
  }
  return { data, usage };
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
  raw?: string;
}

/** 设置页的「测试连接」——这是你验证 CORS 的地方 */
export async function testConnection(
  override: Partial<Settings>,
): Promise<ConnectionTestResult> {
  const started = Date.now();
  try {
    const { content } = await chat(
      {
        messages: [
          { role: 'system', content: '你只需要回一个 JSON。' },
          { role: 'user', content: '回 {"ok": true}' },
        ],
        temperature: 0,
        json: true,
        maxTokens: 64,
      },
      override,
    );
    return {
      ok: true,
      message: '连接正常',
      latencyMs: Date.now() - started,
      raw: content.slice(0, 200),
    };
  } catch (err) {
    const e = err as LlmError;
    return { ok: false, message: e.message ?? String(err) };
  }
}
