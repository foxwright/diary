import { useEffect, useState } from 'react';
import { HistoryPage } from './pages/HistoryPage';
import { MetricsPage } from './pages/MetricsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { TodayPage } from './pages/TodayPage';
import { loadSettings } from './db';
import { Notice } from './components/ui';

type Tab = 'today' | 'history' | 'reports' | 'metrics' | 'settings';

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: 'history', label: '历史' },
  { key: 'reports', label: '月报' },
  { key: 'metrics', label: '数据' },
  { key: 'settings', label: '设置' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [needKey, setNeedKey] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => setNeedKey(!s.apiKey));
  }, [tab]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-16 pt-6">
      <header className="mb-4">
        <h1 className="text-base font-medium text-stone-900">日记</h1>
        <p className="mt-0.5 text-xs text-stone-500">
          说一句就够了。数据只存在这台机器上。
        </p>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-stone-200 pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              tab === t.key
                ? 'border-stone-900 text-stone-900'
                : 'border-transparent text-stone-400 hover:text-stone-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1">
        {tab !== 'settings' && needKey && (
          <div className="mb-3">
            <Notice tone="warn">
              还没填 API Key。「按框架写」不受影响，但自由写、对话引导、月报都用不了。
              去<button className="mx-1 underline" onClick={() => setTab('settings')}>设置</button>
              填一下。
            </Notice>
          </div>
        )}

        {tab === 'today' && <TodayPage />}
        {tab === 'history' && <HistoryPage />}
        {tab === 'reports' && <ReportsPage />}
        {tab === 'metrics' && <MetricsPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
