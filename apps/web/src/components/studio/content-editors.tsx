'use client';

import {
  type AssessmentContent,
  assessmentContentSchema,
  type LearningPathContent,
  learningPathContentSchema,
  type LessonBlock,
  type LessonContent,
  lessonContentSchema,
  type LocalizedText,
} from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import { type ReactNode, useId, useState } from 'react';
import type { z, ZodError } from 'zod';
import { Field } from '@/components/field';
import { SelectField } from '@/components/select-field';
import { useT } from '@/lib/i18n';
import { useLocalized } from '@/lib/learn';
import { cleanText, moved, newId } from '@/lib/studio';
import { LocalizedInput } from './localized-input';
import { usePublishedLessons, usePublishedQuestions } from './pickers';
import { ProblemList } from './problem-list';

export interface EditorProps<T> {
  initial: T | null;
  disabled: boolean;
  saving: boolean;
  submitLabel: string;
  onSave: (content: T) => void;
}

/** Validates against the shared contract before saving, so authors see problems at once. */
function useContractForm<T>(schema: z.ZodType<T>, onSave: (content: T) => void) {
  const [error, setError] = useState<ZodError | null>(null);
  const submit = (candidate: unknown) => {
    const parsed = schema.safeParse(candidate);
    setError(parsed.success ? null : parsed.error);
    if (parsed.success) {
      onSave(parsed.data);
    }
  };
  return { error, submit };
}

function EditorForm(props: {
  disabled: boolean;
  saving: boolean;
  submitLabel: string;
  error: ZodError | null;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <fieldset disabled={props.disabled} className="flex flex-col gap-5">
        {props.children}
      </fieldset>
      <ProblemList error={props.error} />
      {props.disabled ? null : (
        <button type="submit" className="key self-start" disabled={props.saving}>
          {props.submitLabel}
        </button>
      )}
    </form>
  );
}

/** Up, down and remove for one entry in an ordered list. */
function RowTools({
  index,
  count,
  onMove,
  onRemove,
  minimum = 1,
}: {
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  minimum?: number;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="key key-quiet px-3"
        aria-label={t('learn.q.moveUp')}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="key key-quiet px-3"
        aria-label={t('learn.q.moveDown')}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="key key-quiet"
        disabled={count <= minimum}
        onClick={onRemove}
      >
        {t('studio.remove')}
      </button>
    </div>
  );
}

const card = 'flex flex-col gap-3 rounded-control border-2 border-line bg-paper p-4';

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

const BLOCK_TYPES = ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'QUESTION'] as const;
type BlockType = (typeof BLOCK_TYPES)[number];
type DraftBlock = { id: string; type: BlockType } & Record<string, unknown>;

export function LessonEditor({
  initial,
  disabled,
  saving,
  submitLabel,
  onSave,
}: EditorProps<LessonContent>) {
  const t = useT();
  const text = useLocalized();
  const [title, setTitle] = useState<LocalizedText>(initial?.title ?? {});
  const [summary, setSummary] = useState<LocalizedText>(initial?.summary ?? {});
  const [minutes, setMinutes] = useState(String(initial?.estimatedMinutes ?? 10));
  const [blocks, setBlocks] = useState<DraftBlock[]>(
    (initial?.blocks as DraftBlock[] | undefined) ?? [{ id: newId('b'), type: 'TEXT', body: {} }],
  );
  const [adding, setAdding] = useState<BlockType>('TEXT');
  const questions = usePublishedQuestions(!disabled);
  const { error, submit } = useContractForm(lessonContentSchema, onSave);
  const update = (id: string, patch: Record<string, unknown>) =>
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );

  const toContent = () => ({
    title: cleanText(title),
    ...(Object.keys(cleanText(summary)).length ? { summary: cleanText(summary) } : {}),
    estimatedMinutes: Number(minutes),
    blocks: blocks.map((block) => {
      const out: Record<string, unknown> = { ...block };
      for (const key of ['body', 'alt', 'caption', 'transcript']) {
        if (key in out) {
          const cleaned = cleanText(out[key] as LocalizedText);
          if (Object.keys(cleaned).length || key !== 'caption') {
            out[key] = cleaned;
          } else {
            delete out[key];
          }
        }
      }
      return out as LessonBlock;
    }),
  });

  return (
    <EditorForm
      disabled={disabled}
      saving={saving}
      submitLabel={submitLabel}
      error={error}
      onSubmit={() => submit(toContent())}
    >
      <LocalizedInput label={t('studio.field.title')} value={title} onChange={setTitle} required />
      <LocalizedInput
        label={t('studio.field.summary')}
        value={summary}
        onChange={setSummary}
        multiline
      />
      <Field
        label={t('studio.field.minutes')}
        type="number"
        min={1}
        max={120}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-display text-lg font-bold">{t('studio.lesson.blocks')}</legend>
        {blocks.map((block, index) => (
          <div key={block.id} className={card} data-testid="lesson-block">
            <p className="font-bold">
              {index + 1}. {t(`studio.block.${block.type}` as MessageKey)}
            </p>
            {block.type === 'TEXT' ? (
              <LocalizedInput
                label={t('studio.block.body')}
                value={block.body as LocalizedText}
                onChange={(body) => update(block.id, { body })}
                multiline
                required
              />
            ) : null}
            {block.type === 'IMAGE' || block.type === 'AUDIO' || block.type === 'VIDEO' ? (
              <Field
                label={t('studio.block.asset')}
                hint={t('studio.block.assetHint')}
                value={(block.asset as string) ?? ''}
                onChange={(e) => update(block.id, { asset: e.target.value })}
              />
            ) : null}
            {block.type === 'IMAGE' ? (
              <>
                <LocalizedInput
                  label={t('studio.block.alt')}
                  value={block.alt as LocalizedText}
                  onChange={(alt) => update(block.id, { alt })}
                  required
                />
                <LocalizedInput
                  label={t('studio.block.caption')}
                  value={block.caption as LocalizedText}
                  onChange={(caption) => update(block.id, { caption })}
                />
              </>
            ) : null}
            {block.type === 'AUDIO' || block.type === 'VIDEO' ? (
              <LocalizedInput
                label={t('studio.block.transcript')}
                value={block.transcript as LocalizedText}
                onChange={(transcript) => update(block.id, { transcript })}
                multiline
                required
              />
            ) : null}
            {block.type === 'QUESTION' ? (
              <SelectField
                label={t('studio.block.question')}
                value={(block.questionVersionId as string) ?? ''}
                onChange={(e) => update(block.id, { questionVersionId: e.target.value })}
              >
                <option value="">{t('studio.choosePublishedQuestion')}</option>
                {questions.data?.map((question) => (
                  <option key={question.versionId} value={question.versionId}>
                    {text(question.prompt)}
                  </option>
                ))}
              </SelectField>
            ) : null}
            <RowTools
              index={index}
              count={blocks.length}
              onMove={(by) => setBlocks(moved(blocks, index, by))}
              onRemove={() => setBlocks(blocks.filter((b) => b.id !== block.id))}
            />
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t('studio.lesson.blockType')}
            value={adding}
            onChange={(e) => setAdding(e.target.value as BlockType)}
          >
            {BLOCK_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`studio.block.${type}` as MessageKey)}
              </option>
            ))}
          </SelectField>
          <button
            type="button"
            className="key key-quiet"
            disabled={blocks.length >= 60}
            onClick={() => setBlocks([...blocks, newBlock(adding)])}
          >
            {t('studio.lesson.addBlock')}
          </button>
        </div>
      </fieldset>
    </EditorForm>
  );
}

function newBlock(type: BlockType): DraftBlock {
  const id = newId('b');
  switch (type) {
    case 'TEXT':
      return { id, type, body: {} };
    case 'IMAGE':
      return { id, type, asset: '', alt: {} };
    case 'AUDIO':
    case 'VIDEO':
      return { id, type, asset: '', transcript: {} };
    case 'QUESTION':
      return { id, type, questionVersionId: '' };
  }
}

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

export function QuizEditor({
  initial,
  disabled,
  saving,
  submitLabel,
  onSave,
}: EditorProps<AssessmentContent>) {
  const t = useT();
  const text = useLocalized();
  const [title, setTitle] = useState<LocalizedText>(initial?.title ?? {});
  const [instructions, setInstructions] = useState<LocalizedText>(initial?.instructions ?? {});
  const [passPercent, setPassPercent] = useState(
    String(Math.round((initial?.passingScore ?? 0.6) * 100)),
  );
  const [maxAttempts, setMaxAttempts] = useState(
    initial?.maxAttempts ? String(initial.maxAttempts) : '',
  );
  const [items, setItems] = useState(initial?.items ?? []);
  const questions = usePublishedQuestions(!disabled);
  const { error, submit } = useContractForm(assessmentContentSchema, onSave);
  const prompts = new Map((questions.data ?? []).map((q) => [q.versionId, text(q.prompt)]));
  const [picking, setPicking] = useState('');

  const toContent = () => ({
    title: cleanText(title),
    ...(Object.keys(cleanText(instructions)).length
      ? { instructions: cleanText(instructions) }
      : {}),
    items,
    passingScore: Number(passPercent) / 100,
    ...(maxAttempts ? { maxAttempts: Number(maxAttempts) } : {}),
  });

  return (
    <EditorForm
      disabled={disabled}
      saving={saving}
      submitLabel={submitLabel}
      error={error}
      onSubmit={() => submit(toContent())}
    >
      <LocalizedInput label={t('studio.field.title')} value={title} onChange={setTitle} required />
      <LocalizedInput
        label={t('studio.field.instructions')}
        value={instructions}
        onChange={setInstructions}
        multiline
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('studio.quiz.passPercent')}
          type="number"
          min={0}
          max={100}
          value={passPercent}
          onChange={(e) => setPassPercent(e.target.value)}
        />
        <Field
          label={t('studio.quiz.maxAttempts')}
          hint={t('studio.quiz.maxAttemptsHint')}
          type="number"
          min={1}
          max={20}
          value={maxAttempts}
          onChange={(e) => setMaxAttempts(e.target.value)}
        />
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-display text-lg font-bold">{t('studio.quiz.items')}</legend>
        {items.map((item, index) => (
          <div key={item.id} className={card} data-testid="quiz-item">
            <p className="font-bold">
              {index + 1}. {prompts.get(item.questionVersionId) ?? t('studio.questionNotListed')}
            </p>
            <Field
              label={t('studio.quiz.points')}
              type="number"
              min={1}
              max={10}
              value={String(item.points)}
              onChange={(e) =>
                setItems(
                  items.map((i) =>
                    i.id === item.id ? { ...i, points: Number(e.target.value) } : i,
                  ),
                )
              }
            />
            <RowTools
              index={index}
              count={items.length}
              minimum={0}
              onMove={(by) => setItems(moved(items, index, by))}
              onRemove={() => setItems(items.filter((i) => i.id !== item.id))}
            />
          </div>
        ))}
        <AddFromList
          label={t('studio.quiz.addQuestion')}
          placeholder={t('studio.choosePublishedQuestion')}
          value={picking}
          onChange={setPicking}
          options={(questions.data ?? [])
            .filter((q) => !items.some((i) => i.questionVersionId === q.versionId))
            .map((q) => ({ value: q.versionId, label: text(q.prompt) }))}
          onAdd={(versionId) => {
            setItems([...items, { id: newId('q'), questionVersionId: versionId, points: 1 }]);
            setPicking('');
          }}
        />
      </fieldset>
    </EditorForm>
  );
}

/** A select and an Add button, for adding an existing published item to a list. */
function AddFromList(props: {
  label: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  onAdd: (value: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <SelectField
          label={props.label}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        >
          <option value="">{props.placeholder}</option>
          {props.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
      </div>
      <button
        type="button"
        className="key key-quiet"
        disabled={!props.value}
        onClick={() => props.onAdd(props.value)}
      >
        {t('studio.add')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Learning paths
// ---------------------------------------------------------------------------

type DraftUnit = LearningPathContent['units'][number];

export function PathEditor({
  initial,
  disabled,
  saving,
  submitLabel,
  onSave,
}: EditorProps<LearningPathContent>) {
  const t = useT();
  const text = useLocalized();
  const [title, setTitle] = useState<LocalizedText>(initial?.title ?? {});
  const [summary, setSummary] = useState<LocalizedText>(initial?.summary ?? {});
  const [units, setUnits] = useState<DraftUnit[]>(
    initial?.units ?? [{ id: newId('u'), title: {}, lessonIds: [] }],
  );
  const lessons = usePublishedLessons(!disabled);
  const { error, submit } = useContractForm(learningPathContentSchema, onSave);
  const titles = new Map(
    (lessons.data ?? []).map((lesson) => [lesson.lessonId, text(lesson.title)]),
  );
  const used = new Set(units.flatMap((unit) => unit.lessonIds));
  const update = (id: string, patch: Partial<DraftUnit>) =>
    setUnits((current) => current.map((unit) => (unit.id === id ? { ...unit, ...patch } : unit)));

  const toContent = () => ({
    title: cleanText(title),
    ...(Object.keys(cleanText(summary)).length ? { summary: cleanText(summary) } : {}),
    units: units.map((unit) => ({
      id: unit.id,
      title: cleanText(unit.title),
      ...(Object.keys(cleanText(unit.summary)).length ? { summary: cleanText(unit.summary) } : {}),
      lessonIds: unit.lessonIds,
    })),
  });

  return (
    <EditorForm
      disabled={disabled}
      saving={saving}
      submitLabel={submitLabel}
      error={error}
      onSubmit={() => submit(toContent())}
    >
      <LocalizedInput label={t('studio.field.title')} value={title} onChange={setTitle} required />
      <LocalizedInput
        label={t('studio.field.summary')}
        value={summary}
        onChange={setSummary}
        multiline
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-display text-lg font-bold">{t('studio.path.units')}</legend>
        {units.map((unit, index) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            index={index}
            count={units.length}
            titles={titles}
            available={(lessons.data ?? [])
              .filter((lesson) => !used.has(lesson.lessonId))
              .map((lesson) => ({ value: lesson.lessonId, label: text(lesson.title) }))}
            onChange={(patch) => update(unit.id, patch)}
            onMove={(by) => setUnits(moved(units, index, by))}
            onRemove={() => setUnits(units.filter((u) => u.id !== unit.id))}
          />
        ))}
        <button
          type="button"
          className="key key-quiet self-start"
          disabled={units.length >= 40}
          onClick={() => setUnits([...units, { id: newId('u'), title: {}, lessonIds: [] }])}
        >
          {t('studio.path.addUnit')}
        </button>
      </fieldset>
    </EditorForm>
  );
}

function UnitCard(props: {
  unit: DraftUnit;
  index: number;
  count: number;
  titles: Map<string, string>;
  available: { value: string; label: string }[];
  onChange: (patch: Partial<DraftUnit>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const listId = useId();
  const [picking, setPicking] = useState('');
  const { unit } = props;
  return (
    <div className={card} data-testid="path-unit">
      <p className="font-bold">{t('learn.path.unit', { number: props.index + 1 })}</p>
      <LocalizedInput
        label={t('studio.field.title')}
        value={unit.title}
        onChange={(title) => props.onChange({ title })}
        required
      />
      <ol aria-labelledby={listId} className="flex flex-col gap-2">
        {unit.lessonIds.map((lessonId, position) => (
          <li
            key={lessonId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-sheet px-3 py-2"
          >
            <span>
              {position + 1}. {props.titles.get(lessonId) ?? t('studio.lessonNotListed')}
            </span>
            <RowTools
              index={position}
              count={unit.lessonIds.length}
              minimum={0}
              onMove={(by) => props.onChange({ lessonIds: moved(unit.lessonIds, position, by) })}
              onRemove={() =>
                props.onChange({ lessonIds: unit.lessonIds.filter((id) => id !== lessonId) })
              }
            />
          </li>
        ))}
      </ol>
      <span id={listId} className="sr-only">
        {t('studio.path.lessons')}
      </span>
      <AddFromList
        label={t('studio.path.addLesson')}
        placeholder={t('studio.choosePublishedLesson')}
        value={picking}
        onChange={setPicking}
        options={props.available}
        onAdd={(lessonId) => {
          props.onChange({ lessonIds: [...unit.lessonIds, lessonId] });
          setPicking('');
        }}
      />
      <RowTools
        index={props.index}
        count={props.count}
        onMove={props.onMove}
        onRemove={props.onRemove}
      />
    </div>
  );
}
