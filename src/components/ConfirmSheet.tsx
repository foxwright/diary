import { useState } from 'react';
import { FIELD_META, type Fields } from '../types';
import { filledFieldCount, setFieldValue } from '../lib/fields';
import { Button, Notice } from './ui';
import { FieldCard } from './FieldCard';

interface Props {
  title: string;
  note?: string;
  fields: Fields;
  busy?: boolean;
  confirmLabel?: string;
  onFieldsChange: (next: Fields, editedKeys: string[]) => void;
  onConfirm: () => void;
  onBack: () => void;
}

/**
 * 确认页 —— 三条录入路径与月报共用的唯一闸门。
 * 没有点「确认写入」，数据不进库。
 */
export function ConfirmSheet({
  title,
  note,
  fields,
  busy = false,
  confirmLabel = '确认写入',
  onFieldsChange,
  onConfirm,
  onBack,
}: Props) {
  const [editedKeys, setEditedKeys] = useState<string[]>([]);

  function handleCommit(key: (typeof FIELD_META)[number]['key'], value: string | string[]) {
    const next = setFieldValue(fields, key, value);
    const keys = editedKeys.includes(key) ? editedKeys : [...editedKeys, key];
    setEditedKeys(keys);
    onFieldsChange(next, keys);
  }

  const filled = filledFieldCount(fields);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-stone-900">{title}</h2>
          <p className="mt-0.5 text-xs text-stone-500">
            AI 整理的结果，你可以直接改。不满意就改，改完再存。
          </p>
        </div>
        <span className="shrink-0 text-xs text-stone-400">{filled} / 6 项有内容</span>
      </div>

      {note && <Notice tone="warn">{note}</Notice>}

      <Notice>
        留空是正常的。不必凑满六项 —— 只写一项也能存。
      </Notice>

      <div className="space-y-2">
        {FIELD_META.map((meta) => (
          <FieldCard
            key={meta.key}
            meta={meta}
            field={fields[meta.key]}
            onCommit={(v) => handleCommit(meta.key, v)}
          />
        ))}
      </div>

      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 border-t border-stone-200 bg-stone-50/95 px-1 py-3 backdrop-blur">
        <Button variant="primary" onClick={onConfirm} disabled={busy}>
          {busy ? '写入中…' : confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          回去重写
        </Button>
        {editedKeys.length > 0 && (
          <span className="ml-auto text-[11px] text-stone-400">改过 {editedKeys.length} 项</span>
        )}
      </div>
    </div>
  );
}
