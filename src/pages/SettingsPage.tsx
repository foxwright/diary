import { useEffect, useState } from 'react';
import { Button, Card, Notice, Spinner } from '../components/ui';
import { clearAllData, loadSettings, saveSettings } from '../db';
import { testConnection } from '../lib/llm';
import { downloadText, exportAll } from '../lib/metrics';
import {
  forgetKnowledgeDirectory,
  getKnowledgeDirectoryName,
  pickKnowledgeDirectory,
  supportsFileSystemAccess,
} from '../knowledge/localFolder';
import { clearImaCredentials, imaStore, probeIma } from '../knowledge/ima';
import type { Settings } from '../types';

const PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  {
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
];

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dirName, setDirName] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(
    null,
  );
  const [saved, setSaved] = useState(false);
  const [imaProbe, setImaProbe] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      setDirName(await getKnowledgeDirectoryName());
    })();
  }, []);

  if (!settings) return <Spinner label="读取设置…" />;

  function patch(next: Partial<Settings>) {
    setSettings((cur) => (cur ? { ...cur, ...next } : cur));
    setSaved(false);
  }

  async function persist() {
    if (!settings) return;
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function runTest() {
    if (!settings) return;
    setTesting(true);
    setTestResult(null);
    await saveSettings(settings);
    const result = await testConnection({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
    });
    setTestResult(result);
    setTesting(false);
  }

  return (
    <div className="space-y-4">
      <Card
        title="模型接入"
        subtitle="Key 只存在你这台机器的浏览器里（IndexedDB），不会上传到任何地方。"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.name}
                size="sm"
                onClick={() => patch({ baseUrl: p.baseUrl, model: p.model })}
              >
                {p.name}
              </Button>
            ))}
          </div>

          <Field label="baseURL">
            <input
              value={settings.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
            />
          </Field>

          <Field label="model">
            <input
              value={settings.model}
              onChange={(e) => patch({ model: e.target.value })}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
            />
          </Field>

          <Field label="API Key">
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => patch({ apiKey: e.target.value })}
              placeholder="sk-…"
              autoComplete="off"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void persist()}>
              保存
            </Button>
            <Button onClick={() => void runTest()} disabled={testing || !settings.apiKey}>
              {testing ? '测试中…' : '测试连接'}
            </Button>
            {saved && <span className="text-xs text-emerald-700">已保存</span>}
            {settings.apiKey && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (!confirm('清掉 API Key？')) return;
                  patch({ apiKey: '' });
                  void saveSettings({ apiKey: '' });
                }}
              >
                清除 Key
              </Button>
            )}
          </div>

          {testResult && (
            <Notice tone={testResult.ok ? 'good' : 'bad'}>
              {testResult.ok
                ? `连接正常${testResult.latencyMs ? `，${testResult.latencyMs} ms` : ''}。浏览器直连可用。`
                : `失败：${testResult.message}`}
              {!testResult.ok && (
                <p className="mt-1">
                  如果提示请求发不出去，基本是厂商不允许浏览器直连（CORS）。解决办法：换一个厂商，
                  或者在 vite.config.ts 里加 dev proxy。
                </p>
              )}
            </Notice>
          )}
        </div>
      </Card>

      <Card
        title="知识库"
        subtitle="月报和年报写到哪儿。日条目始终只留在本机，不上传。"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={settings.knowledgeStoreId === 'local-folder' ? 'primary' : 'outline'}
              onClick={() => patch({ knowledgeStoreId: 'local-folder' })}
            >
              本地文件夹
            </Button>
            <Button
              variant={settings.knowledgeStoreId === 'ima' ? 'primary' : 'outline'}
              disabled={!imaStore.isAvailable()}
              onClick={() => patch({ knowledgeStoreId: 'ima' })}
            >
              ima 知识库（未验证）
            </Button>
          </div>

          {settings.knowledgeStoreId === 'local-folder' ? (
            <div className="space-y-2">
              <Field label="根目录名">
                <input
                  value={settings.knowledgeTarget}
                  onChange={(e) => patch({ knowledgeTarget: e.target.value })}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() =>
                    void pickKnowledgeDirectory()
                      .then(setDirName)
                      .catch((e) => alert((e as Error).message))
                  }
                >
                  选择写入目录
                </Button>
                {dirName ? (
                  <>
                    <span className="text-xs text-emerald-700">已选：{dirName}</span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        void forgetKnowledgeDirectory().then(() => setDirName(null))
                      }
                    >
                      忘记
                    </Button>
                  </>
                ) : (
                  <span className="text-xs text-stone-400">
                    {supportsFileSystemAccess()
                      ? '未选目录 —— 生成月报时会降级为下载 .md 文件'
                      : '当前浏览器不支持目录写入，会降级为下载 .md'}
                  </span>
                )}
              </div>
              <Notice>
                目录结构：<code>{settings.knowledgeTarget}/月报/2026-09.md</code>、
                <code>{settings.knowledgeTarget}/年报/2026.md</code>
              </Notice>
            </div>
          ) : (
            <div className="space-y-2">
              <Notice tone="warn">{imaStore.unavailableReason()}</Notice>
              <Field label="Client ID">
                <input
                  value={settings.imaClientId}
                  onChange={(e) => patch({ imaClientId: e.target.value })}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
                />
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  value={settings.imaApiKey}
                  onChange={(e) => patch({ imaApiKey: e.target.value })}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
                />
              </Field>
              <Field label="知识库 ID">
                <input
                  value={settings.imaKnowledgeId}
                  onChange={(e) => patch({ imaKnowledgeId: e.target.value })}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void persist()}>保存凭证</Button>
                <Button
                  size="sm"
                  onClick={() =>
                    void probeIma()
                      .then(setImaProbe)
                      .catch((e: unknown) => setImaProbe((e as Error).message))
                  }
                >
                  探测连通性
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    void clearImaCredentials().then(() => patch({ imaApiKey: '', imaClientId: '' }))
                  }
                >
                  清除凭证
                </Button>
              </div>
              {imaProbe && <Notice>{imaProbe}</Notice>}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => void persist()}>
              保存设置
            </Button>
          </div>
        </div>
      </Card>

      <Card title="隐私" subtitle="说清楚数据都去了哪">
        <ul className="space-y-1.5 text-[12px] leading-relaxed text-stone-600">
          <li>
            · 日记原文、六字段、对话全文、月报 —— 全部只存在你这台机器的浏览器 IndexedDB 里。
          </li>
          <li>· API Key 存在 IndexedDB，不写 localStorage，不进任何日志与埋点。</li>
          <li>
            · 唯一离开设备的数据：调用模型时把当次内容发给模型厂商（这是必须有的一步），
            以及你主动写入知识库的月报 / 年报。
          </li>
          <li>· 埋点只写本机，用来算那个「7 日连续率」，从不上报。</li>
        </ul>
      </Card>

      <Card title="数据管理">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() =>
              void exportAll().then((json) =>
                downloadText(`日记数据-${new Date().toISOString().slice(0, 10)}.json`, json),
              )
            }
          >
            导出全部数据（JSON）
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm('清空全部日记、月报与埋点？此操作不可撤销。')) return;
              void clearAllData(false).then(() => alert('已清空（API Key 保留）'));
            }}
          >
            清空全部数据
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!confirm('清空全部数据并删除 API Key 与知识库凭证？此操作不可撤销。')) return;
              void clearAllData(true).then(() => {
                alert('已全部清空');
                location.reload();
              });
            }}
          >
            清空全部数据 + 凭证
          </Button>
        </div>
      </Card>

      <Card title="埋点开关" subtitle="关掉后不再记录任何行为数据，指标看板会缺少数据">
        <label className="flex items-center gap-2 text-[13px] text-stone-700">
          <input
            type="checkbox"
            checked={settings.telemetryEnabled}
            onChange={(e) => {
              patch({ telemetryEnabled: e.target.checked });
              void saveSettings({ telemetryEnabled: e.target.checked });
            }}
          />
          记录本机行为埋点
        </label>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-stone-600">{label}</p>
      {children}
    </div>
  );
}
