import Dexie, { type Table } from 'dexie';
import type {
  DistillSegment,
  Entry,
  MonthlyReport,
  Settings,
  TelemetryEvent,
  YearlyReport,
} from '../types';

/** 存放 FileSystemDirectoryHandle 等无法序列化为普通字段的对象 */
export interface HandleRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
  savedAt: number;
}

export class DiaryDB extends Dexie {
  entries!: Table<Entry, string>;
  segments!: Table<DistillSegment, string>;
  monthlyReports!: Table<MonthlyReport, string>;
  yearlyReports!: Table<YearlyReport, string>;
  settings!: Table<Settings, string>;
  events!: Table<TelemetryEvent, string>;
  handles!: Table<HandleRecord, string>;

  constructor() {
    super('diary');
    this.version(1).stores({
      entries: 'id, &date, inputMode, updatedAt',
      segments: 'id, &[monthKey+segIndex], monthKey',
      monthlyReports: 'id, &monthKey, generatedAt',
      yearlyReports: 'id, &[scope+yearKey], scope',
      settings: 'id',
      events: 'id, ts, type',
      handles: 'id',
    });
  }
}

export const db = new DiaryDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  reminderEnabled: false,
  reminderTime: '21:30',
  telemetryEnabled: true,
  knowledgeStoreId: 'local-folder',
  knowledgeTarget: '知识库',
  imaClientId: '',
  imaApiKey: '',
  imaKnowledgeId: '',
};

export async function loadSettings(): Promise<Settings> {
  const found = await db.settings.get('app');
  if (found) return found;
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = { ...current, ...patch, id: 'app' };
  await db.settings.put(next);
  return next;
}

/** 清空全部业务数据。includeSettings=true 时连 API Key 一起清掉。 */
export async function clearAllData(includeSettings: boolean): Promise<void> {
  await db.transaction(
    'rw',
    [db.entries, db.segments, db.monthlyReports, db.yearlyReports, db.events, db.settings, db.handles],
    async () => {
      await db.entries.clear();
      await db.segments.clear();
      await db.monthlyReports.clear();
      await db.yearlyReports.clear();
      await db.events.clear();
      if (includeSettings) {
        await db.settings.clear();
        await db.handles.clear();
      }
    },
  );
}
