'use client';

import {
  type LocalizedText,
  QUESTION_TYPES,
  type QuestionDefinition,
  questionDefinitionSchema,
  type QuestionType,
} from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import { useId, useState } from 'react';
import { SelectField } from '@/components/select-field';
import { useT } from '@/lib/i18n';
import { cleanText, moved, newId, useEditingLocale } from '@/lib/studio';
import { LocalizedInput } from './localized-input';

/** Types with a form. The rest are written as JSON, checked against the same contract. */
const STRUCTURED: readonly QuestionType[] = [
  'MULTIPLE_CHOICE',
  'MULTIPLE_SELECT',
  'TRUE_FALSE',
  'ORDERING',
  'FILL_IN_BLANK',
  'SHORT_TEXT',
];

interface Option {
  id: string;
  text: LocalizedText;
}

interface Model {
  type: QuestionType;
  prompt: LocalizedText;
  options: Option[];
  correct: string[];
  truth: boolean;
  accepted: string;
  blankText: LocalizedText;
  blankAnswers: Record<string, string>;
  json: string;
}

const twoOptions = (): Option[] => [
  { id: 'a', text: {} },
  { id: 'b', text: {} },
];

function fromDefinition(definition: QuestionDefinition | null): Model {
  const model: Model = {
    type: definition?.type ?? 'MULTIPLE_CHOICE',
    prompt: definition?.prompt ?? {},
    options: twoOptions(),
    correct: [],
    truth: true,
    accepted: '',
    blankText: {},
    blankAnswers: {},
    json: definition ? JSON.stringify(definition, null, 2) : '',
  };
  switch (definition?.type) {
    case 'MULTIPLE_CHOICE':
      return {
        ...model,
        options: definition.options,
        correct: [definition.answer.correctOptionId],
      };
    case 'MULTIPLE_SELECT':
      return { ...model, options: definition.options, correct: definition.answer.correctOptionIds };
    case 'TRUE_FALSE':
      return { ...model, truth: definition.answer.correct };
    case 'ORDERING': {
      const byId = new Map(definition.items.map((item) => [item.id, item]));
      const options = definition.answer.orderedIds.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
      return { ...model, options };
    }
    case 'SHORT_TEXT':
      return { ...model, accepted: definition.answer.accepted.join('\n') };
    case 'FILL_IN_BLANK':
      return {
        ...model,
        blankText: definition.text,
        blankAnswers: Object.fromEntries(
          definition.answer.blanks.map((b) => [b.id, b.accepted.join('\n')]),
        ),
      };
    default:
      return model;
  }
}

const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const blankIds = (text: LocalizedText) => [
  ...new Set(
    Object.values(text).flatMap((value) =>
      [...(value ?? '').matchAll(/\{\{(\w[\w-]*)\}\}/g)].map((m) => m[1] as string),
    ),
  ),
];

/** Builds the definition the form describes. The contract decides whether it is valid. */
function toDefinition(model: Model): unknown {
  const options = model.options.map((option) => ({ id: option.id, text: cleanText(option.text) }));
  const base = { prompt: cleanText(model.prompt) };
  switch (model.type) {
    case 'MULTIPLE_CHOICE':
      return { type: model.type, ...base, options, answer: { correctOptionId: model.correct[0] } };
    case 'MULTIPLE_SELECT':
      return { type: model.type, ...base, options, answer: { correctOptionIds: model.correct } };
    case 'TRUE_FALSE':
      return { type: model.type, ...base, answer: { correct: model.truth } };
    case 'ORDERING':
      // Authors write items in the right order; learners get them shuffled.
      return {
        type: model.type,
        ...base,
        items: options,
        answer: { orderedIds: options.map((o) => o.id) },
      };
    case 'SHORT_TEXT':
      return { type: model.type, ...base, answer: { accepted: lines(model.accepted) } };
    case 'FILL_IN_BLANK':
      return {
        type: model.type,
        ...base,
        text: cleanText(model.blankText),
        answer: {
          blanks: blankIds(model.blankText).map((id) => ({
            id,
            accepted: lines(model.blankAnswers[id] ?? ''),
          })),
        },
      };
    default:
      try {
        return { ...(JSON.parse(model.json) as object), type: model.type };
      } catch {
        return null;
      }
  }
}

export function QuestionEditor({
  initial,
  disabled,
  saving,
  submitLabel,
  onSave,
}: {
  initial: QuestionDefinition | null;
  disabled: boolean;
  saving: boolean;
  submitLabel: string;
  onSave: (definition: QuestionDefinition) => void;
}) {
  const t = useT();
  const locale = useEditingLocale();
  const answersId = useId();
  const [model, setModel] = useState<Model>(() => fromDefinition(initial));
  const [problems, setProblems] = useState<string[]>([]);
  const set = (patch: Partial<Model>) => setModel((current) => ({ ...current, ...patch }));
  const structured = STRUCTURED.includes(model.type);
  const hasOptions = ['MULTIPLE_CHOICE', 'MULTIPLE_SELECT', 'ORDERING'].includes(model.type);

  const save = () => {
    const parsed = questionDefinitionSchema.safeParse(toDefinition(model));
    if (!parsed.success) {
      setProblems(
        parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || t('studio.question.whole')}: ${issue.message}`,
        ),
      );
      return;
    }
    setProblems([]);
    onSave(parsed.data);
  };

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <fieldset disabled={disabled} className="flex flex-col gap-5">
        <SelectField
          label={t('studio.question.type')}
          value={model.type}
          disabled={initial !== null}
          onChange={(event) => set({ type: event.target.value as QuestionType, correct: [] })}
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`studio.qtype.${type}` as MessageKey)}
            </option>
          ))}
        </SelectField>

        {structured ? (
          <LocalizedInput
            label={t('studio.question.prompt')}
            value={model.prompt}
            onChange={(prompt) => set({ prompt })}
            multiline
            required
          />
        ) : null}

        {model.type === 'TRUE_FALSE' ? (
          <SelectField
            label={t('studio.question.correctAnswer')}
            value={String(model.truth)}
            onChange={(event) => set({ truth: event.target.value === 'true' })}
          >
            <option value="true">{t('learn.q.true')}</option>
            <option value="false">{t('learn.q.false')}</option>
          </SelectField>
        ) : null}

        {hasOptions ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 font-semibold">
              {model.type === 'ORDERING'
                ? t('studio.question.itemsInOrder')
                : t('studio.question.options')}
            </legend>
            {model.options.map((option, index) => (
              <div
                key={option.id}
                className="flex flex-col gap-2 rounded-control border-2 border-line bg-paper p-3"
              >
                <LocalizedInput
                  label={t('studio.question.optionNumber', { number: index + 1 })}
                  value={option.text}
                  onChange={(text) =>
                    set({
                      options: model.options.map((o) => (o.id === option.id ? { ...o, text } : o)),
                    })
                  }
                  required
                />
                <div className="flex flex-wrap items-center gap-3">
                  {model.type !== 'ORDERING' ? (
                    <label className="flex items-center gap-2 font-medium">
                      <input
                        type={model.type === 'MULTIPLE_CHOICE' ? 'radio' : 'checkbox'}
                        name={`${answersId}-correct`}
                        className="size-5 accent-sky"
                        checked={model.correct.includes(option.id)}
                        onChange={(event) => {
                          if (model.type === 'MULTIPLE_CHOICE') {
                            set({ correct: [option.id] });
                          } else {
                            set({
                              correct: event.target.checked
                                ? [...model.correct, option.id]
                                : model.correct.filter((id) => id !== option.id),
                            });
                          }
                        }}
                      />
                      {t('studio.question.isCorrect')}
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="key key-quiet px-3"
                    aria-label={t('learn.q.moveUp')}
                    disabled={index === 0}
                    onClick={() => set({ options: moved(model.options, index, -1) })}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="key key-quiet px-3"
                    aria-label={t('learn.q.moveDown')}
                    disabled={index === model.options.length - 1}
                    onClick={() => set({ options: moved(model.options, index, 1) })}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="key key-quiet"
                    disabled={model.options.length <= 2}
                    onClick={() =>
                      set({
                        options: model.options.filter((o) => o.id !== option.id),
                        correct: model.correct.filter((id) => id !== option.id),
                      })
                    }
                  >
                    {t('studio.remove')}
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="key key-quiet self-start"
              disabled={model.options.length >= 12}
              onClick={() => set({ options: [...model.options, { id: newId('o'), text: {} }] })}
            >
              {t('studio.question.addOption')}
            </button>
          </fieldset>
        ) : null}

        {model.type === 'SHORT_TEXT' ? (
          <TextArea
            label={t('studio.question.accepted')}
            hint={t('studio.question.acceptedHint')}
            value={model.accepted}
            onChange={(accepted) => set({ accepted })}
          />
        ) : null}

        {model.type === 'FILL_IN_BLANK' ? (
          <>
            <LocalizedInput
              label={t('studio.question.blankText')}
              value={model.blankText}
              onChange={(blankText) => set({ blankText })}
              multiline
              required
            />
            <p className="-mt-3 text-sm text-ink-soft">{t('studio.question.blankHint')}</p>
            {blankIds(model.blankText).map((id) => (
              <TextArea
                key={id}
                label={t('studio.question.blankAnswers', { blank: id })}
                hint={t('studio.question.acceptedHint')}
                value={model.blankAnswers[id] ?? ''}
                onChange={(value) => set({ blankAnswers: { ...model.blankAnswers, [id]: value } })}
              />
            ))}
          </>
        ) : null}

        {!structured ? (
          <TextArea
            label={t('studio.question.json')}
            hint={t('studio.question.jsonHint', { locale })}
            value={model.json}
            rows={14}
            mono
            onChange={(json) => set({ json })}
          />
        ) : null}
      </fieldset>

      {problems.length > 0 ? (
        <div role="alert" className="rounded-control bg-coral/15 px-4 py-3 text-danger">
          <p className="font-bold">{t('studio.question.invalid')}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {problems.slice(0, 8).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {disabled ? null : (
        <button type="submit" className="key self-start" disabled={saving}>
          {submitLabel}
        </button>
      )}
    </form>
  );
}

function TextArea(props: {
  label: string;
  hint?: string;
  value: string;
  rows?: number;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {props.label}
      </label>
      <textarea
        id={id}
        rows={props.rows ?? 3}
        className={`mt-1.5 w-full rounded-control border-2 border-ink bg-sheet p-3 ${props.mono ? 'font-mono text-sm' : 'text-lg'}`}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.hint ? <p className="mt-1 text-sm text-ink-soft">{props.hint}</p> : null}
    </div>
  );
}
