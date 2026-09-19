import { loadSettings } from '../db';
import { imaStore } from './ima';
import { localFolderStore } from './localFolder';
import type { KnowledgeStore, KnowledgeStoreId } from './types';

export const STORES: Record<KnowledgeStoreId, KnowledgeStore> = {
  'local-folder': localFolderStore,
  ima: imaStore,
};

export async function activeStore(): Promise<KnowledgeStore> {
  const settings = await loadSettings();
  const store = STORES[settings.knowledgeStoreId] ?? localFolderStore;
  return store.isAvailable() ? store : localFolderStore;
}

export { localFolderStore, imaStore };
export * from './types';
export { renderMonthlyMarkdown, renderYearlyMarkdown, reportFileName } from './render';
