import { useEffect, useRef, useState } from 'react';
import type { Field, FieldMeta } from '../types';
import { Badge } from './ui';

interface Props {
  meta: FieldMeta;
  field: Field | null;
  editable?: boolean;
  onCommit?: (value: string | string[]) => void;
}

export function FieldCard({ meta, field, editable = true, onCommit }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [actionsDraft, setActionsDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const value = field?.value ?? null;
  const display = Array.isArray(value) ? value : value ?? '';

  useEffect(() => {
    if (!editing) return;
    if (meta.multi) {
      setActionsDraft(Array.isArray(value) ? value.join('\n') : '');
    } else {
      setDraft(typeof value === 'string' ? value : '');
    }
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing, meta.multi, value]);

  function startEdit() {
    if (!editable) return;
    setEditing(true);
  }

  function commit() {
    if (!onCommit) return;
    if (meta.multi) {
      const list = actionsDraft
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      onCommit(list);
    } else {
      onCommit(draft.trim());
    }
    setEditing(false);
  }

  function cancel() {
    setEditing(false);
  }

  const lowConfidence = field?.confidence === 'low';
  const wasEdited = field?.source === 'user_edited';

  const isEmpty = Array.isArray(display) ? display.length === 0 : display === '';

  return (
    <div
      className={`group rounded-lg border px-3 py-2.5 transition-colors ${
        editing ? 'border-stone-400 bg-white' : 'border-stone-200 bg-white hover:border-stone-300'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-stone-800">{meta.label}</span>
          {lowConfidence && <Badge tone="warn">把握不大</Badge>}
          {wasEdited && <Badge>你改过</Badge>}
        </div>
        {editable && !editing && (
          <button
            onClick={startEdit}
            className="text-[11px] text-stone-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-stone-700"
          >
            改
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            ref={inputRef}
            value={meta.multi ? actionsDraft : draft}
            onChange={(e) => (meta.multi ? setActionsDraft(e.target.value) : setDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
              if (e.key === 'Enter' && !meta.multi && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Enter' && meta.multi && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
            onBlur={commit}
            rows={meta.multi ? 4 : 2}
            placeholder={meta.hint}
            className="w-full resize-y rounded border border-stone-300 px-2 py-1.5 text-[13px] leading-relaxed outline-none focus:border-stone-500"
          />
          <p className="mt-1 text-[11px] text-stone-400">
            {meta.multi ? '一行一条 · Ctrl/⌘+Enter 保存 · Esc 取消' : '回车保存 · Esc 取消'}
          </p>
        </div>
      ) : (
        <div className="mt-1">
          {isEmpty ? (
            <button
              onClick={startEdit}
              disabled={!editable}
              className="text-[13px] text-stone-400 hover:text-stone-600 disabled:cursor-default"
            >
              {editable ? '— 点此补充' : '—'}
            </button>
          ) : Array.isArray(display) ? (
            <ul className="space-y-0.5">
              {display.map((item, i) => (
                <li key={i} className="text-[13px] leading-relaxed text-stone-700">
                  · {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-stone-700">{display}</p>
          )}
        </div>
      )}
    </div>
  );
}
