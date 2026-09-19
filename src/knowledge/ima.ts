import { db, loadSettings } from '../db';
import type { MonthlyReport, YearlyReport } from '../types';
import { reportFileName, renderMonthlyMarkdown, renderYearlyMarkdown } from './render';
import type { KnowledgeItem, KnowledgeStore } from './types';

/**
 * ⚠️ 未验证实现
 *
 * ima 开放平台的具体接口路径与请求体字段目前拿不到（本机 skill 包缺少
 * `knowledge-base/SKILL.md` 与 `ima_api.cjs`，只剩顶层 SKILL.md）。
 * 因此这里只固定两件事：
 *   1. 传输方式：POST + JSON，发往 https://ima.qq.com，凭证走请求头
 *   2. 凭证来源：用户在本机设置页填写，存 IndexedDB，不上传任何第三方
 * 剩下的路径与字段留成常量，等拿到官方文档后补齐即可，接口层不用改。
 *
 * 在凭证缺失或接口未补齐前，isAvailable() 返回 false，产品自动走本地文件夹适配器。
 */

const IMA_BASE_URL = 'https://ima.qq.com';

/** TODO(待官方文档): 以下路径与字段均未验证，不要当成事实 */
const ENDPOINTS = {
  createMedia: '/openapi/create_media',
  addKnowledge: '/openapi/add_knowledge',
  listKnowledge: '/openapi/list_knowledge',
};

interface ImaCredentials {
  clientId: string;
  apiKey: string;
  knowledgeId: string;
}

async function credentials(): Promise<ImaCredentials | null> {
  const s = await loadSettings();
  if (!s.imaClientId || !s.imaApiKey) return null;
  return { clientId: s.imaClientId, apiKey: s.imaApiKey, knowledgeId: s.imaKnowledgeId };
}

async function post(path: string, body: unknown, cred: ImaCredentials): Promise<unknown> {
  const res = await fetch(`${IMA_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Client-Id': cred.clientId,
      Authorization: `Bearer ${cred.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ima ${path} 返回 HTTP ${res.status}：${text.slice(0, 200)}`);
  }
  const parsed = JSON.parse(text) as { code?: number; msg?: string; data?: unknown };
  if (typeof parsed.code === 'number' && parsed.code !== 0) {
    throw new Error(`ima 业务错误 ${parsed.code}：${parsed.msg ?? ''}`);
  }
  return parsed.data ?? parsed;
}

export const imaStore: KnowledgeStore = {
  id: 'ima',
  label: 'ima 知识库（未验证）',

  isAvailable() {
    return false; // 待接口联调通过后改为按凭证判断
  },

  unavailableReason() {
    return 'ima 适配器已搭好传输层，但接口路径与字段未验证（本机 skill 包缺 knowledge-base 模块与 ima_api.cjs）。提供 Client ID / API Key 与接口文档后即可联调。当前请使用「本地文件夹」。';
  },

  async putMonthly(report: MonthlyReport) {
    const cred = await credentials();
    if (!cred) throw new Error('未填写 ima 凭证');
    const markdown = renderMonthlyMarkdown(report);
    const media = await post(
      ENDPOINTS.createMedia,
      { file_name: reportFileName(report), content: markdown, content_format: 1 },
      cred,
    );
    await post(
      ENDPOINTS.addKnowledge,
      { knowledge_id: cred.knowledgeId, media_type: 11, media: media },
      cred,
    );
    return { ref: `ima:${report.monthKey}` };
  },

  async putYearly(report: YearlyReport) {
    const cred = await credentials();
    if (!cred) throw new Error('未填写 ima 凭证');
    const markdown = renderYearlyMarkdown(report);
    const media = await post(
      ENDPOINTS.createMedia,
      { file_name: reportFileName(report), content: markdown, content_format: 1 },
      cred,
    );
    await post(
      ENDPOINTS.addKnowledge,
      { knowledge_id: cred.knowledgeId, media_type: 11, media: media },
      cred,
    );
    return { ref: `ima:${report.yearKey ?? report.scope}` };
  },

  async list(): Promise<KnowledgeItem[]> {
    return [];
  },
};

/** 供联调时手动验证用，不参与主流程 */
export async function probeIma(): Promise<string> {
  const cred = await credentials();
  if (!cred) return '未填写凭证';
  try {
    const data = await post(ENDPOINTS.listKnowledge, { limit: 5 }, cred);
    return `连通。返回：${JSON.stringify(data).slice(0, 300)}`;
  } catch (err) {
    return `失败：${(err as Error).message}`;
  }
}

export async function hasImaCredentials(): Promise<boolean> {
  return (await credentials()) !== null;
}

export async function clearImaCredentials(): Promise<void> {
  const s = await loadSettings();
  await db.settings.put({ ...s, imaClientId: '', imaApiKey: '', imaKnowledgeId: '' });
}
