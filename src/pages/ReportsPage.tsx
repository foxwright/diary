import { useEffect, useState } from 'react';
import { Button, Card, Empty, Notice, Spinner } from '../components/ui';
import { formatMonthLabel, monthKeyOf, shiftMonth, todayKey } from '../lib/date';
import { activeStore } from '../knowledge';
import {
  generateMonthlyReport,
  generateYearlyReport,
  listMonthlyReports,
  listYearlyReports,
  previewMonth,
  reportCharCount,
  type DistillPreview,
} from '../lib/reports';
import { REPORT_LAYER_META, type MonthlyReport, type YearlyReport } from '../types';

export function ReportsPage() {
  const [monthKey, setMonthKey] = useState(monthKeyOf(todayKey()));
  const [preview, setPreview] = useState<DistillPreview | null>(null);
  const [months, setMonths] = useState<MonthlyReport[]>([]);
  const [years, setYears] = useState<YearlyReport[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [message, setMessage] = useState<{ tone: 'good' | 'warn' | 'bad'; text: string } | null>(
    null,
  );
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [storeLabel, setStoreLabel] = useState('');

  useEffect(() => {
    void refresh();
  }, [monthKey]);

  async function refresh() {
    setPreview(await previewMonth(monthKey));
    setMonths(await listMonthlyReports());
    setYears(await listYearlyReports());
    const store = await activeStore();
    setStoreLabel(store.label);
  }

  async function runMonth() {
    setBusy(true);
    setMessage(null);
    setProgress('派子代理蒸馏中…');
    try {
      const result = await generateMonthlyReport(monthKey, { sync: true });
      const { stats } = result;
      setMessage({
        tone: result.syncError ? 'warn' : 'good',
        text: `月报已生成。本次蒸馏 ${stats.called} 段、跳过 ${stats.skipped} 段、失败 ${stats.failed} 段。${
          result.syncError ? `知识库写入失败：${result.syncError}` : `已写入：${storeLabel}`
        }`,
      });
      setOpenMonth(monthKey);
      await refresh();
    } catch (err) {
      setMessage({ tone: 'bad', text: (err as Error).message });
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function runYear(scope: 'year' | 'career', yearKey?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await generateYearlyReport(scope, yearKey, { sync: true });
      setMessage({
        tone: result.syncError ? 'warn' : 'good',
        text: `${scope === 'career' ? '生涯汇报' : `${yearKey} 年报`}已生成，来源 ${result.report.sourceMonthKeys.length} 份月报。${
          result.syncError ? `知识库写入失败：${result.syncError}` : `已写入：${storeLabel}`
        }`,
      });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'bad', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const yearsWithMonths = [...new Set(months.map((m) => m.monthKey.slice(0, 4)))].sort();

  return (
    <div className="space-y-4">
      <Card
        title="生成月报"
        subtitle={`知识库：${storeLabel || '读取中…'}`}
        action={
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMonthKey(shiftMonth(monthKey, -1))}
              disabled={busy}
            >
              ←
            </Button>
            <input
              type="month"
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value || monthKey)}
              className="rounded border border-stone-300 px-2 py-1 text-xs outline-none"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMonthKey(shiftMonth(monthKey, 1))}
              disabled={busy}
            >
              →
            </Button>
          </div>
        }
      >
        {preview ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="已过天数" value={`${preview.days} 天`} />
              <Stat label="子代理待调用" value={`${preview.toCall} 个`} />
              <Stat label="命中缓存跳过" value={`${preview.toSkip} 段`} />
            </div>

            {preview.isPartial && (
              <Notice tone="warn">
                这个月还没结束，会按已过天数缩小规模。月报里会标注「未结束」。
              </Notice>
            )}

            <div className="rounded-lg border border-stone-200">
              <p className="border-b border-stone-100 px-3 py-2 text-[11px] font-medium text-stone-500">
                切段方案（段数 = 向下取整(天数 ÷ 7)，上限 4；余数并入最后一段）
              </p>
              <div className="divide-y divide-stone-50">
                {preview.segments.map((s) => (
                  <div key={s.index} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="text-stone-600">
                      第 {s.index} 段 · {s.from} ~ {s.to}
                    </span>
                    <span className="text-stone-400">
                      {s.entryCount} 条记录 ·{' '}
                      {s.willSkip ? (
                        <span className="text-emerald-600">复用缓存</span>
                      ) : s.entryCount === 0 ? (
                        <span className="text-stone-400">空段，不调用</span>
                      ) : (
                        <span className="text-amber-700">待蒸馏</span>
                      )}
                    </span>
                  </div>
                ))}
                {preview.segments.length === 0 && (
                  <p className="px-3 py-2 text-xs text-stone-400">这个月还没开始</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => void runMonth()} disabled={busy}>
                {busy ? progress || '生成中…' : '生成本月月报'}
              </Button>
              <Button variant="ghost" onClick={() => void refresh()} disabled={busy}>
                刷新预览
              </Button>
            </div>
          </div>
        ) : (
          <Spinner label="读取中…" />
        )}
      </Card>

      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Card title="已生成的月报" subtitle={`共 ${months.length} 份`}>
        {months.length === 0 && <Empty>还没有月报。</Empty>}
        <div className="space-y-2">
          {months.map((m) => (
            <div key={m.id} className="rounded-lg border border-stone-200">
              <button
                className="flex w-full items-center justify-between px-3 py-2 text-left"
                onClick={() => setOpenMonth(openMonth === m.monthKey ? null : m.monthKey)}
              >
                <span className="text-[13px] font-medium text-stone-900">
                  {formatMonthLabel(m.monthKey)}
                  {m.isPartial && <span className="ml-2 text-[11px] text-amber-700">未结束</span>}
                </span>
                <span className="text-[11px] text-stone-400">
                  {reportCharCount(m)} 字 ·{' '}
                  {m.syncStatus === 'synced' ? '已同步' : m.syncStatus === 'failed' ? '同步失败' : '未同步'}
                </span>
              </button>
              {openMonth === m.monthKey && (
                <div className="space-y-3 border-t border-stone-100 px-3 py-3">
                  <p className="text-[11px] text-stone-400">
                    覆盖 {m.rangeStart} ~ {m.rangeEnd} · 段 {m.coveredSegments.join('/')} ·{' '}
                    {m.promptVersion}
                    {m.syncRef ? ` · ${m.syncRef}` : ''}
                  </p>
                  {REPORT_LAYER_META.map((layer) => (
                    <div key={layer.key}>
                      <p className="text-[12px] font-medium text-stone-800">
                        {layer.label}
                        <span className="ml-2 text-[11px] font-normal text-stone-400">
                          {layer.hint}
                        </span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-stone-700">
                        {m.layers[layer.key] || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="再提炼：年报 / 生涯汇报"
        subtitle="输入是月报，不是日条目。所以你看不到流水。"
      >
        {months.length === 0 ? (
          <Empty>先生成至少一份月报。</Empty>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {yearsWithMonths.map((y) => (
                <Button key={y} onClick={() => void runYear('year', y)} disabled={busy}>
                  生成 {y} 年报
                </Button>
              ))}
              <Button variant="outline" onClick={() => void runYear('career')} disabled={busy}>
                生成生涯汇报
              </Button>
            </div>
            {years.length > 0 && (
              <div className="mt-2 space-y-2">
                {years.map((y) => (
                  <div key={y.id} className="rounded-lg border border-stone-200 px-3 py-2">
                    <p className="text-[12px] font-medium text-stone-900">
                      {y.scope === 'career' ? '生涯汇报' : `${y.yearKey} 年报`}
                      <span className="ml-2 text-[11px] font-normal text-stone-400">
                        来源 {y.sourceMonthKeys.length} 个月
                      </span>
                    </p>
                    <div className="mt-2 space-y-2">
                      {REPORT_LAYER_META.map((layer) => (
                        <div key={layer.key}>
                          <p className="text-[11px] font-medium text-stone-600">{layer.label}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-stone-600">
                            {y.layers[layer.key] || '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-200 px-2 py-2">
      <p className="text-[11px] text-stone-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-stone-900">{value}</p>
    </div>
  );
}
