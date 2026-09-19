export type InputMode = 'framework' | 'freeform' | 'dialog';

export type Confidence = 'high' | 'mid' | 'low';

export type FieldSource =
  | 'user_written'
  | 'extracted'
  | 'dialog_extracted'
  | 'user_edited';

export const FIELD_KEYS = [
  'goal',
  'state',
  'actions',
  'feedback',
  'reflection',
  'other',
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

export interface FieldMeta {
  key: FieldKey;
  label: string;
  hint: string;
  /** actions 是列表型字段 */
  multi: boolean;
}

export const FIELD_META: FieldMeta[] = [
  { key: 'goal', label: '目标', hint: '今天一开始想做成什么', multi: false },
  { key: 'state', label: '今日状态', hint: '情绪和精力怎么样', multi: false },
  { key: 'actions', label: '具体行动', hint: '实际发生了什么，只写事', multi: true },
  { key: 'feedback', label: '正反馈 / 成果', hint: '今天有什么进展或好结果', multi: false },
  { key: 'reflection', label: '经验总结 / 反思', hint: '有什么值得记下来的', multi: false },
  { key: 'other', label: '其他', hint: '情绪、关系、身体，随便写', multi: false },
];

export interface Field {
  value: string | string[];
  confidence: Confidence;
  source: FieldSource;
  editedAt?: number;
}

export type Fields = Record<FieldKey, Field | null>;

export interface DialogTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Entry {
  id: string;
  /** YYYY-MM-DD，本地时区，一天一条 */
  date: string;
  inputMode: InputMode;
  /** 用户原文，永不覆盖 */
  rawText: string;
  /** inputMode === 'dialog' 时保留全文 */
  dialog?: DialogTurn[];
  fields: Fields;
  /** 用户确认落库的时间 */
  confirmedAt: number;
  createdAt: number;
  updatedAt: number;
  promptVersion: string;
}

export interface DistillContent {
  actions: string;
  learnings: string;
  pending: string;
  signals: string;
}

export interface DistillSegment {
  id: string;
  monthKey: string;
  segIndex: number;
  from: string;
  to: string;
  /** hash(段内 entry 的 id+updatedAt 拼接)，用于判断是否需要重蒸 */
  fingerprint: string;
  content: DistillContent;
  generatedAt: number;
  promptVersion: string;
}

export const REPORT_LAYER_KEYS = [
  'behavior',
  'todo',
  'cognition',
  'guidance',
] as const;

export type ReportLayerKey = (typeof REPORT_LAYER_KEYS)[number];

export interface ReportLayers {
  behavior: string;
  todo: string;
  cognition: string;
  guidance: string;
}

export const REPORT_LAYER_META: { key: ReportLayerKey; label: string; hint: string }[] = [
  { key: 'behavior', label: '行为层', hint: '做了什么、学了什么' },
  { key: 'todo', label: '待办层', hint: '要做什么' },
  { key: 'cognition', label: '认知层', hint: '认识到什么规律或心得' },
  { key: 'guidance', label: '指导层', hint: 'agent 针对本月提出的建议' },
];

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface MonthlyReport {
  id: string;
  monthKey: string;
  rangeStart: string;
  rangeEnd: string;
  isPartial: boolean;
  coveredSegments: number[];
  layers: ReportLayers;
  generatedAt: number;
  promptVersion: string;
  syncStatus: SyncStatus;
  syncRef?: string;
}

export type YearlyScope = 'year' | 'career';

export interface YearlyReport {
  id: string;
  scope: YearlyScope;
  yearKey?: string;
  rangeStart: string;
  rangeEnd: string;
  sourceMonthKeys: string[];
  layers: ReportLayers;
  generatedAt: number;
  promptVersion: string;
  syncStatus: SyncStatus;
  syncRef?: string;
}

export interface Settings {
  id: 'app';
  apiKey: string;
  baseUrl: string;
  model: string;
  reminderEnabled: boolean;
  reminderTime: string;
  telemetryEnabled: boolean;
  knowledgeStoreId: 'local-folder' | 'ima';
  /** 本地文件夹的根目录名 */
  knowledgeTarget: string;
  /** ima 开放平台凭证（仅存本机 IndexedDB） */
  imaClientId: string;
  imaApiKey: string;
  /** ima 目标知识库标识（未确定时留空） */
  imaKnowledgeId: string;
}

export type EventType =
  | 'entry_start'
  | 'entry_save'
  | 'field_edit'
  | 'dialog_turn'
  | 'monthly_report_generated'
  | 'yearly_report_generated'
  | 'history_view'
  | 'export';

export interface TelemetryEvent {
  id: string;
  ts: number;
  type: EventType;
  payload: Record<string, unknown>;
}
