import { useEffect, useState } from 'react';
import { FieldCard } from '../components/FieldCard';
import { Button, Card, Empty, Notice } from '../components/ui';
import { formatDateLabel } from '../lib/date';
import { deleteEntry, searchEntries, updateEntryFields } from '../lib/entries';
import { setFieldValue } from '../lib/fields';
import { downloadText, exportEntriesMarkdown } from '../lib/metrics';
import { track } from '../lib/telemetry';
import { FIELD_META, type Entry } from '../types';

export function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [keyword, setKeyword] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void run('');
  }, []);

  async function run(q: string) {
    setLoading(true);
    const list = await searchEntries(q);
    setEntries(list);
    setLoading(false);
    if (q) await track('history_view', { keyword: q, hits: list.length });
  }

  async function handleExport() {
    const md = await exportEntriesMarkdown();
    downloadText(`日记导出-${new Date().toISOString().slice(0, 10)}.md`, md, 'text/markdown');
    await track('export', { scope: 'entries', count: entries.length });
  }

  return (
    <div className="space-y-4">
      <Card
        title="历史"
        subtitle={`共 ${entries.length} 条`}
        action={
          <Button size="sm" variant="ghost" onClick={() => void handleExport()}>
            导出 Markdown
          </Button>
        }
      >
        <div className="flex gap-2">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run(keyword);
            }}
            placeholder="搜关键词 —— 原文、对话、每个字段都会搜"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500"
          />
          <Button onClick={() => void run(keyword)}>搜</Button>
          {keyword && (
            <Button
              variant="ghost"
              onClick={() => {
                setKeyword('');
                void run('');
              }}
            >
              清空
            </Button>
          )}
        </div>
      </Card>

      {loading && <Empty>读取中…</Empty>}
      {!loading && entries.length === 0 && <Empty>没有匹配的记录。</Empty>}

      {entries.map((e) => (
        <Card key={e.id} className="overflow-hidden">
          <button
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setOpenId(openId === e.id ? null : e.id)}
          >
            <div>
              <p className="text-[13px] font-medium text-stone-900">{formatDateLabel(e.date)}</p>
              <p className="mt-0.5 text-[11px] text-stone-400">
                {e.inputMode === 'framework'
                  ? '按框架写'
                  : e.inputMode === 'freeform'
                    ? '自由写'
                    : '对话引导'}
                {e.dialog?.length ? ` · ${e.dialog.length} 轮对话` : ''}
              </p>
            </div>
            <span className="text-xs text-stone-400">{openId === e.id ? '收起' : '展开'}</span>
          </button>

          {openId === e.id && (
            <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
              {FIELD_META.map((meta) => (
                <FieldCard
                  key={meta.key}
                  meta={meta}
                  field={e.fields[meta.key]}
                  onCommit={(v) => {
                    const next = setFieldValue(e.fields, meta.key, v);
                    void updateEntryFields(e.id, next, [meta.key]).then(() => void run(keyword));
                  }}
                />
              ))}

              {e.rawText.trim() && (
                <div className="rounded-lg border border-dashed border-stone-200 px-3 py-2">
                  <p className="text-[11px] font-medium text-stone-500">原始输入（不会被覆盖）</p>
                  <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-stone-600">
                    {e.rawText}
                  </p>
                </div>
              )}

              {e.dialog && e.dialog.length > 0 && (
                <details className="rounded-lg border border-dashed border-stone-200 px-3 py-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-stone-500">
                    完整对话（{e.dialog.length} 轮）
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {e.dialog.map((t, i) => (
                      <p key={i} className="text-[12px] leading-relaxed text-stone-600">
                        <span className="text-stone-400">{t.role === 'user' ? '你' : 'AI'}：</span>
                        {t.content}
                      </p>
                    ))}
                  </div>
                </details>
              )}

              <div className="flex justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (!confirm(`删掉 ${e.date} 这条？该日期所在段的蒸馏缓存会一起失效。`)) return;
                    void deleteEntry(e.id).then(() => void run(keyword));
                  }}
                >
                  删除这条
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}

      {entries.length > 0 && (
        <Notice>
          改任何一条日记，都会让它所在那一段的蒸馏缓存失效 —— 下次生成月报时只重蒸那一段，其他段复用。
        </Notice>
      )}
    </div>
  );
}
