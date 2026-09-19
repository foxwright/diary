import { useEffect, useState } from 'react';
import { Badge, Card, Empty, Notice, Spinner } from '../components/ui';
import { computeMetrics, type MetricsBundle } from '../lib/metrics';

export function MetricsPage() {
  const [data, setData] = useState<MetricsBundle | null>(null);

  useEffect(() => {
    void computeMetrics().then(setData);
  }, []);

  if (!data) return <Spinner label="计算中…" />;

  const { cards, totals } = data;

  return (
    <div className="space-y-4">
      <Notice tone="warn">
        <strong>Kill criteria：</strong>自测满 7 天后，若「7 日连续率 &lt; 5/7」
        <strong> 且 </strong>「确认修改率 &gt; 70%」，判定录入机制未成立 —— 停在这里，
        回去重做录入路径，不要继续做发布那一档。
      </Notice>

      <Card title="总量" subtitle="全部数据只存在你这台机器的浏览器里，从不上传">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="条目" value={String(totals.entries)} />
          <Stat label="有记录的天数" value={String(totals.days)} />
          <Stat label="月报" value={String(totals.monthReports)} />
          <Stat label="年报" value={String(totals.yearReports)} />
          <Stat label="LLM 调用" value={String(totals.llmCalls)} />
          <Stat label="累计 token" value={totals.totalTokens.toLocaleString()} />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <div key={c.key} className="rounded-xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-stone-900">{c.label}</p>
              {c.ok === null ? (
                <Badge>看分布</Badge>
              ) : c.ok ? (
                <Badge tone="good">达标</Badge>
              ) : (
                <Badge tone="warn">未达标</Badge>
              )}
            </div>
            <p className="mt-1.5 text-lg font-medium text-stone-900">{c.display}</p>
            <p className="mt-0.5 text-[11px] text-stone-400">目标：{c.target}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-stone-500">{c.note}</p>
          </div>
        ))}
      </div>

      {totals.entries === 0 && <Empty>还没有数据。先去「今天」记一条。</Empty>}
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
