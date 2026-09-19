import { useEffect, useMemo, useState } from 'react';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { FieldCard } from '../components/FieldCard';
import { Button, Card, Empty, Notice, Spinner } from '../components/ui';
import { getEntryByDate, saveEntry, searchEntries, updateEntryFields } from '../lib/entries';
import {
  guideNext,
  MAX_DIALOG_TURNS,
  summarizeDialog,
  userTurnsText,
} from '../lib/dialog';
import { extractFields } from '../lib/extract';
import { emptyFields, filledFieldCount, setFieldValue } from '../lib/fields';
import { todayKey } from '../lib/date';
import { track } from '../lib/telemetry';
import { FIELD_KEYS, FIELD_META, type DialogTurn, type Entry, type Fields, type InputMode } from '../types';

type Stage =
  | { kind: 'choose' }
  | { kind: 'framework'; drafts: Record<string, string> }
  | { kind: 'freeform'; text: string }
  | {
      kind: 'dialog';
      turns: DialogTurn[];
      input: string;
      thinking: boolean;
      done: boolean;
    }
  | {
      kind: 'confirm';
      mode: InputMode;
      fields: Fields;
      rawText: string;
      dialog?: DialogTurn[];
      note?: string;
      promptVersion: string;
    };

export function TodayPage() {
  const today = todayKey();
  const [existing, setExisting] = useState<Entry | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'choose' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Entry[]>([]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const found = await getEntryByDate(today);
    setExisting(found ?? null);
    const list = await searchEntries('');
    setRecent(list.filter((e) => e.date !== today).slice(0, 5));
  }

  async function confirmFields(next: Fields, editedKeys: string[]) {
    if (stage.kind !== 'confirm') return;
    setStage({ ...stage, fields: next });
    if (editedKeys.length) {
      await track('field_edit', { stage: 'confirm', editedKeys });
    }
  }

  async function doSave() {
    if (stage.kind !== 'confirm') return;
    setBusy(true);
    setError(null);
    try {
      await saveEntry({
        date: today,
        inputMode: stage.mode,
        rawText: stage.rawText,
        dialog: stage.dialog,
        fields: stage.fields,
        promptVersion: stage.promptVersion,
      });
      setStage({ kind: 'choose' });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // ---------- 路径 B ----------
  async function runExtract(text: string) {
    setBusy(true);
    setError(null);
    await track('entry_start', { mode: 'freeform' });
    const outcome = await extractFields(text);
    setBusy(false);
    setStage({
      kind: 'confirm',
      mode: 'freeform',
      fields: outcome.fields,
      rawText: text,
      note: outcome.degraded
        ? `AI 这次没整理出来（${outcome.error ?? '未知原因'}）。原文已经留着，你可以自己填，或者就这样存。`
        : undefined,
      promptVersion: outcome.promptVersion,
    });
  }

  // ---------- 路径 C ----------
  async function startDialog() {
    setBusy(true);
    setError(null);
    await track('entry_start', { mode: 'dialog' });
    const { step } = await guideNext([], 1, MAX_DIALOG_TURNS);
    await track('dialog_turn', { turn: 1, role: 'assistant' });
    setBusy(false);
    setStage({
      kind: 'dialog',
      turns: step.end ? [] : [{ role: 'assistant', content: step.say }],
      input: '',
      thinking: false,
      done: step.end,
    });
  }

  async function sendDialogTurn(raw: string) {
    if (stage.kind !== 'dialog' || !raw.trim()) return;
    const turns: DialogTurn[] = [...stage.turns, { role: 'user', content: raw.trim() }];
    await track('dialog_turn', { turn: turns.length, role: 'user' });
    setStage({ ...stage, turns, input: '', thinking: true });

    const turn = Math.floor(turns.length / 2) + 1;
    const { step } = await guideNext(turns, turn, MAX_DIALOG_TURNS);
    await track('dialog_turn', { turn: turn + 1, role: 'assistant', end: step.end });

    if (step.end || turn >= MAX_DIALOG_TURNS) {
      setStage({ ...stage, turns, input: '', thinking: false, done: true });
      return;
    }
    setStage({
      ...stage,
      turns: [...turns, { role: 'assistant', content: step.say }],
      input: '',
      thinking: false,
      done: false,
    });
  }

  async function finishDialog() {
    if (stage.kind !== 'dialog') return;
    setBusy(true);
    setError(null);
    const userText = userTurnsText(stage.turns);
    const outcome = await summarizeDialog(stage.turns);
    setBusy(false);
    setStage({
      kind: 'confirm',
      mode: 'dialog',
      fields: outcome.fields,
      rawText: userText,
      dialog: stage.turns,
      note: outcome.degraded
        ? `AI 这次没整理出来（${outcome.error ?? '未知原因'}）。你说过的话都留着，可以自己填。`
        : '这些是只从你自己的话里整理出来的，助手的提问没有算进去。',
      promptVersion: outcome.promptVersion,
    });
  }

  // ---------- 路径 A ----------
  function submitFramework(drafts: Record<string, string>) {
    const fields = emptyFields();
    for (const meta of FIELD_META) {
      const raw = (drafts[meta.key] ?? '').trim();
      if (!raw) continue;
      if (meta.multi) {
        fields[meta.key] = {
          value: raw.split('\n').map((s) => s.trim()).filter(Boolean),
          confidence: 'high',
          source: 'user_written',
        };
      } else {
        fields[meta.key] = { value: raw, confidence: 'high', source: 'user_written' };
      }
    }
    setStage({
      kind: 'confirm',
      mode: 'framework',
      fields,
      rawText: '',
      note: '路径 A 没有调用 AI，这六项是你自己写的。',
      promptVersion: 'none@0',
    });
  }

  async function saveExistingEdit(next: Fields, editedKeys: string[]) {
    if (!existing) return;
    await updateEntryFields(existing.id, next, editedKeys);
    setExisting({ ...existing, fields: next });
    await refresh();
  }

  const existingFilled = existing ? filledFieldCount(existing.fields) : 0;

  if (stage.kind === 'confirm') {
    return (
      <ConfirmSheet
        title="确认一下，存就这样"
        note={stage.note}
        fields={stage.fields}
        busy={busy}
        onFieldsChange={(next, keys) => void confirmFields(next, keys)}
        onConfirm={() => void doSave()}
        onBack={() => setStage({ kind: 'choose' })}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && <Notice tone="bad">{error}</Notice>}

      {existing && (
        <Card
          title={`今天已经记过了 · ${existing.date}`}
          subtitle={`${existingFilled} / 6 项有内容 · 来源：${
            existing.inputMode === 'framework'
              ? '按框架写'
              : existing.inputMode === 'freeform'
                ? '自由写'
                : '对话引导'
          }`}
          action={
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              刷新
            </Button>
          }
        >
          <div className="space-y-2">
            {FIELD_META.map((meta) => (
              <FieldCard
                key={meta.key}
                meta={meta}
                field={existing.fields[meta.key]}
                onCommit={(v) => void saveExistingEdit(setFieldValue(existing.fields, meta.key, v), [meta.key])}
              />
            ))}
          </div>
        </Card>
      )}

      {stage.kind === 'choose' && (
        <>
          <Card
            title={existing ? '再补一条' : '今天想怎么记'}
            subtitle="三条路，挑一条顺手的。都没有必填项。"
          >
            <div className="space-y-2">
              <PathRow
                title="按框架写"
                desc="六个格子摆在那儿，想填哪个填哪个。不调用 AI，最快。"
                action={
                  <Button
                    onClick={() => setStage({ kind: 'framework', drafts: {} })}
                    variant="primary"
                  >
                    开始
                  </Button>
                }
              />
              <PathRow
                title="自由写"
                desc="大框里想说什么说什么，交给 AI 整理成六个格子，你看过再存。"
                action={
                  <Button onClick={() => setStage({ kind: 'freeform', text: '' })}>开始</Button>
                }
              />
              <PathRow
                title="写不出来，帮我问问自己"
                desc="AI 一句一句问，你随口答。最多 6 轮，随时能停。"
                action={
                  <Button onClick={() => void startDialog()} disabled={busy}>
                    {busy ? '准备中…' : '开始'}
                  </Button>
                }
              />
            </div>
          </Card>

          {recent.length > 0 && (
            <Card title="最近记过" subtitle="点开看不了详情，但能确认数据还在">
              <div className="space-y-1">
                {recent.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between rounded border border-stone-100 px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-stone-600">{e.date}</span>
                    <span className="text-stone-400">
                      {filledFieldCount(e.fields)} / 6 项
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {stage.kind === 'framework' && (
        <FrameworkEditor
          drafts={stage.drafts}
          onChange={(drafts) => setStage({ kind: 'framework', drafts })}
          onSubmit={() => submitFramework(stage.drafts)}
          onBack={() => setStage({ kind: 'choose' })}
        />
      )}

      {stage.kind === 'freeform' && (
        <Card title="自由写" subtitle="不用管格式，写完之后 AI 会整理。整理结果你能改。">
          <textarea
            value={stage.text}
            onChange={(e) => setStage({ kind: 'freeform', text: e.target.value })}
            rows={8}
            autoFocus
            placeholder="今天……"
            className="w-full resize-y rounded-lg border border-stone-300 px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-stone-500"
          />
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="primary"
              disabled={busy || !stage.text.trim()}
              onClick={() => void runExtract(stage.text)}
            >
              {busy ? '整理中…' : '让 AI 整理'}
            </Button>
            <Button variant="ghost" onClick={() => setStage({ kind: 'choose' })} disabled={busy}>
              返回
            </Button>
            <Button
              variant="ghost"
              disabled={!stage.text.trim()}
              onClick={() =>
                setStage({
                  kind: 'confirm',
                  mode: 'freeform',
                  fields: emptyFields(),
                  rawText: stage.text,
                  note: '没调用 AI。原文留着，格子空着，你想填再填。',
                  promptVersion: 'none@0',
                })
              }
            >
              跳过 AI，直接存原文
            </Button>
          </div>
        </Card>
      )}

      {stage.kind === 'dialog' && (
        <Card
          title="帮你问问自己"
          subtitle={`最多 ${MAX_DIALOG_TURNS} 轮 · 随时可以停下来`}
          action={
            <Button variant="outline" size="sm" onClick={() => void finishDialog()} disabled={busy}>
              {busy ? '整理中…' : '说完了'}
            </Button>
          }
        >
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {stage.turns.length === 0 && (
              <Empty>还没有开始。点下面输入框随便说点什么。</Empty>
            )}
            {stage.turns.map((t, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                  t.role === 'assistant'
                    ? 'bg-stone-100 text-stone-700'
                    : 'ml-auto bg-stone-900 text-white'
                }`}
              >
                {t.content}
              </div>
            ))}
            {stage.thinking && <Spinner label="在想下一句…" />}
            {stage.done && (
              <Notice tone="good">问得差不多了。点右上角「说完了」，我把你说过的整理出来。</Notice>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={stage.input}
              onChange={(e) =>
                setStage(stage.kind === 'dialog' ? { ...stage, input: e.target.value } : stage)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendDialogTurn(stage.input);
                }
              }}
              placeholder="随口说，不用组织语言"
              disabled={stage.thinking || stage.done}
              className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-[13px] outline-none focus:border-stone-500 disabled:bg-stone-50"
            />
            <Button
              variant="primary"
              onClick={() => void sendDialogTurn(stage.input)}
              disabled={stage.thinking || stage.done || !stage.input.trim()}
            >
              说
            </Button>
            <Button variant="ghost" onClick={() => setStage({ kind: 'choose' })}>
              退出
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function PathRow({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2.5">
      <div>
        <p className="text-[13px] font-medium text-stone-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{desc}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function FrameworkEditor({
  drafts,
  onChange,
  onSubmit,
  onBack,
}: {
  drafts: Record<string, string>;
  onChange: (drafts: Record<string, string>) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const filled = useMemo(
    () => FIELD_KEYS.filter((k) => (drafts[k] ?? '').trim()).length,
    [drafts],
  );

  return (
    <Card
      title="按框架写"
      subtitle="六个格子都在，但一个都不用填满。"
      action={<span className="text-xs text-stone-400">{filled} / 6 项</span>}
    >
      <div className="space-y-2">
        {FIELD_META.map((meta) => (
          <div key={meta.key} className="rounded-lg border border-stone-200 px-3 py-2">
            <p className="text-[13px] font-medium text-stone-800">{meta.label}</p>
            <textarea
              value={drafts[meta.key] ?? ''}
              onChange={(e) => onChange({ ...drafts, [meta.key]: e.target.value })}
              rows={meta.multi ? 3 : 2}
              placeholder={meta.hint}
              className="mt-1 w-full resize-y rounded border border-stone-200 px-2 py-1.5 text-[13px] leading-relaxed outline-none focus:border-stone-500"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" onClick={onSubmit} disabled={filled === 0}>
          下一步
        </Button>
        <Button variant="ghost" onClick={onBack}>
          返回
        </Button>
        <span className="ml-auto text-[11px] text-stone-400">全程不调用 AI，写完就存</span>
      </div>
    </Card>
  );
}
