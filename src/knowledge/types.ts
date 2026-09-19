import type { MonthlyReport, YearlyReport } from '../types';

export type KnowledgeStoreId = 'local-folder' | 'ima';

export interface PutResult {
  ref: string;
  /** 浏览器可打开的地址；本地下载方式下为空 */
  url?: string;
  /** 是否走了降级通道（下载 .md 而不是写入目录） */
  fallbackDownload?: boolean;
}

export interface KnowledgeItem {
  ref: string;
  kind: 'monthly' | 'yearly';
  key: string;
}

export interface KnowledgeStore {
  id: KnowledgeStoreId;
  label: string;
  /** 当前环境 / 配置下能不能用 */
  isAvailable(): boolean;
  /** 不可用原因，给 UI 显示 */
  unavailableReason(): string | null;
  putMonthly(report: MonthlyReport): Promise<PutResult>;
  putYearly(report: YearlyReport): Promise<PutResult>;
  list(): Promise<KnowledgeItem[]>;
}
