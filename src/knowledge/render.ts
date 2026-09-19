import type { MonthlyReport, ReportLayers, YearlyReport } from '../types';
import { REPORT_LAYER_META } from '../types';

function layerBlock(layers: ReportLayers): string {
  return REPORT_LAYER_META.map((m) => `### ${m.label}（${m.hint}）\n\n${layers[m.key] || '—'}`).join(
    '\n\n',
  );
}

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function renderMonthlyMarkdown(report: MonthlyReport): string {
  const title = `${report.monthKey} 月报`;
  const partial = report.isPartial
    ? `> 本月未结束，覆盖 ${report.rangeStart} 至 ${report.rangeEnd}\n`
    : '';
  return `# ${title}

${partial}
- 覆盖范围：${report.rangeStart} ~ ${report.rangeEnd}
- 蒸馏段：${report.coveredSegments.map((i) => `第 ${i} 段`).join('、') || '—'}
- 生成时间：${fmtTs(report.generatedAt)}
- Prompt：\`${report.promptVersion}\`

${layerBlock(report.layers)}
`;
}

export function renderYearlyMarkdown(report: YearlyReport): string {
  const label = report.scope === 'career' ? '生涯汇报' : `${report.yearKey} 年报`;
  return `# ${label}

- 来源月份：${report.sourceMonthKeys.join('、')}
- 覆盖范围：${report.rangeStart} ~ ${report.rangeEnd}
- 生成时间：${fmtTs(report.generatedAt)}
- Prompt：\`${report.promptVersion}\`

${layerBlock(report.layers)}
`;
}

export function reportFileName(report: MonthlyReport | YearlyReport): string {
  if ('monthKey' in report) return `${report.monthKey}.md`;
  if (report.scope === 'career') return 'career.md';
  return `${report.yearKey}.md`;
}

export function reportSubDir(report: MonthlyReport | YearlyReport): string {
  return 'monthKey' in report ? '月报' : '年报';
}
