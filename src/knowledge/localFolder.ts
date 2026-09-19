import { db, loadSettings } from '../db';
import type { MonthlyReport, YearlyReport } from '../types';
import { reportFileName, reportSubDir, renderMonthlyMarkdown, renderYearlyMarkdown } from './render';
import type { KnowledgeItem, KnowledgeStore, PutResult } from './types';

interface WritableFileStreamLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  createWritable(): Promise<WritableFileStreamLike>;
}

interface DirHandleLike {
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

type DirectoryPicker = (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirHandleLike>;

const HANDLE_ID = 'knowledge-root';

function picker(): DirectoryPicker | null {
  const w = window as unknown as { showDirectoryPicker?: DirectoryPicker };
  return typeof w.showDirectoryPicker === 'function' ? w.showDirectoryPicker : null;
}

export function supportsFileSystemAccess(): boolean {
  return picker() !== null;
}

export async function pickKnowledgeDirectory(): Promise<string> {
  const p = picker();
  if (!p) throw new Error('当前浏览器不支持选择本地目录，请用 Chrome 或 Edge');
  const handle = await p({ mode: 'readwrite' });
  await db.handles.put({ id: HANDLE_ID, handle: handle as unknown as FileSystemDirectoryHandle, savedAt: Date.now() });
  return handle.name;
}

export async function getKnowledgeDirectoryName(): Promise<string | null> {
  const record = await db.handles.get(HANDLE_ID);
  return record?.handle?.name ?? null;
}

export async function forgetKnowledgeDirectory(): Promise<void> {
  await db.handles.delete(HANDLE_ID);
}

async function getWritableDirectory(): Promise<DirHandleLike | null> {
  const record = await db.handles.get(HANDLE_ID);
  if (!record?.handle) return null;
  const handle = record.handle as unknown as DirHandleLike;
  try {
    const state = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (state === 'granted') return handle;
    const asked = (await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    return asked === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

function downloadMarkdown(fileName: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function writeReport(
  report: MonthlyReport | YearlyReport,
  markdown: string,
): Promise<PutResult> {
  const settings = await loadSettings();
  const subDir = reportSubDir(report);
  const fileName = reportFileName(report);
  const rootName = settings.knowledgeTarget || '知识库';

  const dir = await getWritableDirectory();
  if (!dir) {
    downloadMarkdown(fileName, markdown);
    return {
      ref: `${rootName}/${subDir}/${fileName}（已下载，未写入目录）`,
      fallbackDownload: true,
    };
  }

  const root = await dir.getDirectoryHandle(rootName, { create: true });
  const target = await root.getDirectoryHandle(subDir, { create: true });
  const file = await target.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(markdown);
  await writable.close();

  return { ref: `${rootName}/${subDir}/${fileName}` };
}

export const localFolderStore: KnowledgeStore = {
  id: 'local-folder',
  label: '本地文件夹',

  isAvailable() {
    return true;
  },

  unavailableReason() {
    return supportsFileSystemAccess()
      ? null
      : '当前浏览器不支持目录写入，将降级为下载 .md 文件（Chrome / Edge 支持）';
  },

  async putMonthly(report) {
    return writeReport(report, renderMonthlyMarkdown(report));
  },

  async putYearly(report) {
    return writeReport(report, renderYearlyMarkdown(report));
  },

  async list(): Promise<KnowledgeItem[]> {
    const [months, years] = await Promise.all([
      db.monthlyReports.toArray(),
      db.yearlyReports.toArray(),
    ]);
    return [
      ...months.map((m) => ({ ref: m.syncRef ?? m.monthKey, kind: 'monthly' as const, key: m.monthKey })),
      ...years.map((y) => ({
        ref: y.syncRef ?? (y.yearKey ?? y.scope),
        kind: 'yearly' as const,
        key: y.yearKey ?? y.scope,
      })),
    ];
  },
};
