'use client';

import type { LearnerQuestion, QuestionResponse } from '@impulse/contracts';
import { type ReactNode, useId } from 'react';
import { useT } from '@/lib/i18n';
import { useLocalized } from '@/lib/learn';

type Of<T extends LearnerQuestion['type']> = Extract<LearnerQuestion, { type: T }>;
type ResponseOf<T extends QuestionResponse['type']> = Extract<QuestionResponse, { type: T }>;

interface Props {
  question: LearnerQuestion;
  /** The learner's answer so far, or null before they give one. */
  value: QuestionResponse | null;
  onChange: (value: QuestionResponse | null) => void;
  disabled?: boolean;
}

/**
 * Collects a learner's answer to any question type. It only builds the response: it never
 * knows the answer key and never says whether an answer is right. The server marks it.
 */
export function QuestionInput({ question, value, onChange, disabled = false }: Props) {
  const text = useLocalized();
  const answer = value?.type === question.type ? value : null;
  const common = { disabled, onChange };

  return (
    <fieldset className="flex flex-col gap-4" disabled={disabled}>
      <legend className="mb-4 font-display text-xl leading-snug font-bold">
        {text(question.prompt)}
      </legend>
      {renderBody(question, answer, common)}
    </fieldset>
  );
}

interface Common {
  disabled: boolean;
  onChange: (value: QuestionResponse | null) => void;
}

function renderBody(question: LearnerQuestion, answer: QuestionResponse | null, c: Common) {
  switch (question.type) {
    case 'MULTIPLE_CHOICE':
      return (
        <SingleChoice question={question} answer={answer as ResponseOf<'MULTIPLE_CHOICE'>} {...c} />
      );
    case 'MULTIPLE_SELECT':
      return (
        <MultiSelect question={question} answer={answer as ResponseOf<'MULTIPLE_SELECT'>} {...c} />
      );
    case 'TRUE_FALSE':
      return <TrueFalse answer={answer as ResponseOf<'TRUE_FALSE'>} {...c} />;
    case 'MATCHING':
      return <Matching question={question} answer={answer as ResponseOf<'MATCHING'>} {...c} />;
    case 'ORDERING':
      return <Ordering question={question} answer={answer as ResponseOf<'ORDERING'>} {...c} />;
    case 'DRAG_AND_DROP':
      return <Sorting question={question} answer={answer as ResponseOf<'DRAG_AND_DROP'>} {...c} />;
    case 'FILL_IN_BLANK':
      return <Blanks question={question} answer={answer as ResponseOf<'FILL_IN_BLANK'>} {...c} />;
    case 'SHORT_TEXT':
      return <ShortText answer={answer as ResponseOf<'SHORT_TEXT'>} {...c} />;
    case 'INTERACTIVE_SCENARIO':
      return (
        <Scenario
          question={question}
          answer={answer as ResponseOf<'INTERACTIVE_SCENARIO'>}
          {...c}
        />
      );
    // Recording audio needs uploads, and hotspots need the picture served. Neither exists yet.
    case 'AUDIO_RESPONSE':
    case 'IMAGE_HOTSPOT':
      return <Unsupported />;
  }
}

/** A large tappable row, sized for small fingers. */
function Choice({ children, checked }: { children: ReactNode; checked: boolean }) {
  return (
    <label
      className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-control border-2 px-4 py-3 text-lg ${
        checked ? 'border-sky bg-sky/10' : 'border-line bg-sheet'
      }`}
    >
      {children}
    </label>
  );
}

function SingleChoice({
  question,
  answer,
  onChange,
}: Common & { question: Of<'MULTIPLE_CHOICE'>; answer: ResponseOf<'MULTIPLE_CHOICE'> | null }) {
  const text = useLocalized();
  const name = useId();
  return question.options.map((option) => (
    <Choice key={option.id} checked={answer?.optionId === option.id}>
      <input
        type="radio"
        name={name}
        className="size-5 accent-sky"
        checked={answer?.optionId === option.id}
        onChange={() => onChange({ type: 'MULTIPLE_CHOICE', optionId: option.id })}
      />
      {text(option.text)}
    </Choice>
  ));
}

function MultiSelect({
  question,
  answer,
  onChange,
}: Common & { question: Of<'MULTIPLE_SELECT'>; answer: ResponseOf<'MULTIPLE_SELECT'> | null }) {
  const t = useT();
  const text = useLocalized();
  const chosen = new Set(answer?.optionIds ?? []);
  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next.size === 0 ? null : { type: 'MULTIPLE_SELECT', optionIds: [...next] });
  };
  return (
    <>
      <p className="text-ink-soft">{t('learn.q.chooseAll')}</p>
      {question.options.map((option) => (
        <Choice key={option.id} checked={chosen.has(option.id)}>
          <input
            type="checkbox"
            className="size-5 accent-sky"
            checked={chosen.has(option.id)}
            onChange={() => toggle(option.id)}
          />
          {text(option.text)}
        </Choice>
      ))}
    </>
  );
}

function TrueFalse({ answer, onChange }: Common & { answer: ResponseOf<'TRUE_FALSE'> | null }) {
  const t = useT();
  const name = useId();
  return (
    <div className="grid grid-cols-2 gap-3">
      {[true, false].map((value) => (
        <Choice key={String(value)} checked={answer?.value === value}>
          <input
            type="radio"
            name={name}
            className="size-5 accent-sky"
            checked={answer?.value === value}
            onChange={() => onChange({ type: 'TRUE_FALSE', value })}
          />
          {t(value ? 'learn.q.true' : 'learn.q.false')}
        </Choice>
      ))}
    </div>
  );
}

/** A select per item is the accessible form of drawing lines or dragging cards. */
function PickPerItem({
  items,
  options,
  chosen,
  placeholder,
  onPick,
}: {
  items: { id: string; label: string }[];
  options: { id: string; label: string }[];
  chosen: Map<string, string>;
  placeholder: string;
  onPick: (itemId: string, optionId: string) => void;
}) {
  const id = useId();
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="flex flex-col gap-2 rounded-control border-2 border-line bg-sheet p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <label htmlFor={`${id}-${index}`} className="text-lg">
            {item.label}
          </label>
          <select
            id={`${id}-${index}`}
            className="min-h-12 rounded-control border-2 border-ink bg-sheet px-3"
            value={chosen.get(item.id) ?? ''}
            onChange={(event) => onPick(item.id, event.target.value)}
          >
            <option value="">{placeholder}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}

function Matching({
  question,
  answer,
  onChange,
}: Common & { question: Of<'MATCHING'>; answer: ResponseOf<'MATCHING'> | null }) {
  const t = useT();
  const text = useLocalized();
  const chosen = new Map((answer?.pairs ?? []).map((pair) => [pair.leftId, pair.rightId]));
  return (
    <PickPerItem
      items={question.left.map((item) => ({ id: item.id, label: text(item.text) }))}
      options={question.right.map((item) => ({ id: item.id, label: text(item.text) }))}
      chosen={chosen}
      placeholder={t('learn.q.chooseMatch')}
      onPick={(leftId, rightId) => {
        const next = new Map(chosen);
        if (rightId) {
          next.set(leftId, rightId);
        } else {
          next.delete(leftId);
        }
        const pairs = [...next].map(([l, r]) => ({ leftId: l, rightId: r }));
        onChange(pairs.length === 0 ? null : { type: 'MATCHING', pairs });
      }}
    />
  );
}

function Sorting({
  question,
  answer,
  onChange,
}: Common & { question: Of<'DRAG_AND_DROP'>; answer: ResponseOf<'DRAG_AND_DROP'> | null }) {
  const t = useT();
  const text = useLocalized();
  const chosen = new Map((answer?.placements ?? []).map((p) => [p.itemId, p.zoneId]));
  return (
    <PickPerItem
      items={question.items.map((item) => ({ id: item.id, label: text(item.text) }))}
      options={question.zones.map((zone) => ({ id: zone.id, label: text(zone.text) }))}
      chosen={chosen}
      placeholder={t('learn.q.chooseZone')}
      onPick={(itemId, zoneId) => {
        const next = new Map(chosen);
        if (zoneId) {
          next.set(itemId, zoneId);
        } else {
          next.delete(itemId);
        }
        const placements = [...next].map(([i, z]) => ({ itemId: i, zoneId: z }));
        onChange(placements.length === 0 ? null : { type: 'DRAG_AND_DROP', placements });
      }}
    />
  );
}

/** Up and down buttons rather than dragging, so it works by keyboard, switch and touch alike. */
function Ordering({
  question,
  answer,
  onChange,
}: Common & { question: Of<'ORDERING'>; answer: ResponseOf<'ORDERING'> | null }) {
  const t = useT();
  const text = useLocalized();
  const byId = new Map(question.items.map((item) => [item.id, item]));
  const order = answer?.orderedIds ?? question.items.map((item) => item.id);
  const move = (index: number, by: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item as string);
    onChange({ type: 'ORDERING', orderedIds: next });
  };
  return (
    <>
      <ol className="flex flex-col gap-2">
        {order.map((id, index) => {
          const label = text((byId.get(id) as Of<'ORDERING'>['items'][number]).text);
          return (
            <li
              key={id}
              className="flex items-center justify-between gap-3 rounded-control border-2 border-line bg-sheet px-4 py-2 text-lg"
            >
              <span>
                {index + 1}. {label}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="key key-quiet px-3"
                  aria-label={`${t('learn.q.moveUp')}: ${label}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="key key-quiet px-3"
                  aria-label={`${t('learn.q.moveDown')}: ${label}`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      {answer ? null : (
        <button
          type="button"
          className="key key-quiet self-start"
          onClick={() => onChange({ type: 'ORDERING', orderedIds: order })}
        >
          {t('learn.q.keepOrder')}
        </button>
      )}
    </>
  );
}

type ScenarioNode = Of<'INTERACTIVE_SCENARIO'>['nodes'][number];

const BLANK = /\{\{(\w[\w-]*)\}\}/g;

function Blanks({
  question,
  answer,
  onChange,
}: Common & { question: Of<'FILL_IN_BLANK'>; answer: ResponseOf<'FILL_IN_BLANK'> | null }) {
  const t = useT();
  const text = useLocalized();
  const values = new Map((answer?.blanks ?? []).map((blank) => [blank.id, blank.value]));
  const source = text(question.text);
  const parts: ReactNode[] = [];
  let last = 0;
  let number = 0;
  for (const match of source.matchAll(BLANK)) {
    const blankId = match[1] as string;
    number += 1;
    parts.push(source.slice(last, match.index));
    parts.push(
      <input
        key={`${blankId}-${number}`}
        aria-label={t('learn.q.blank', { number })}
        className="mx-1 inline-block w-32 rounded-control border-2 border-ink bg-sheet px-2 py-1 text-lg"
        value={values.get(blankId) ?? ''}
        maxLength={200}
        onChange={(event) => {
          const next = new Map(values);
          next.set(blankId, event.target.value);
          const blanks = [...next]
            .filter(([, value]) => value.trim() !== '')
            .map(([id, value]) => ({ id, value }));
          onChange(blanks.length === 0 ? null : { type: 'FILL_IN_BLANK', blanks });
        }}
      />,
    );
    last = (match.index ?? 0) + match[0].length;
  }
  parts.push(source.slice(last));
  return <p className="text-lg leading-[2.6]">{parts}</p>;
}

function ShortText({ answer, onChange }: Common & { answer: ResponseOf<'SHORT_TEXT'> | null }) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-bold">
        {t('learn.q.yourAnswer')}
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={2000}
        className="rounded-control border-2 border-ink bg-sheet p-3 text-lg"
        value={answer?.text ?? ''}
        onChange={(event) =>
          onChange(
            event.target.value.trim() === ''
              ? null
              : { type: 'SHORT_TEXT', text: event.target.value },
          )
        }
      />
    </div>
  );
}

/** Walks the story from the start node, one choice at a time. */
function Scenario({
  question,
  answer,
  onChange,
}: Common & {
  question: Of<'INTERACTIVE_SCENARIO'>;
  answer: ResponseOf<'INTERACTIVE_SCENARIO'> | null;
}) {
  const t = useT();
  const text = useLocalized();
  const nodes = new Map(question.nodes.map((node) => [node.id, node]));
  const taken = answer?.choiceIds ?? [];
  // Replay the choices so far to find where the story is now.
  let current: string | undefined = question.startNodeId;
  const history: { node: string; choice: string }[] = [];
  for (const choiceId of taken) {
    const step: ScenarioNode | undefined = current ? nodes.get(current) : undefined;
    const choice: ScenarioNode['choices'][number] | undefined = step?.choices.find(
      (candidate) => candidate.id === choiceId,
    );
    if (!step || !choice) {
      break;
    }
    history.push({ node: text(step.text), choice: text(choice.text) });
    current = choice.next;
  }
  const node = current ? nodes.get(current) : undefined;
  return (
    <div className="flex flex-col gap-4">
      {history.map((step, index) => (
        <p key={index} className="text-ink-soft">
          {step.node} <strong className="text-ink">→ {step.choice}</strong>
        </p>
      ))}
      {node ? (
        <>
          <p className="text-lg">{text(node.text)}</p>
          <div className="flex flex-col gap-2">
            {node.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="key key-quiet justify-start text-left"
                onClick={() =>
                  onChange({ type: 'INTERACTIVE_SCENARIO', choiceIds: [...taken, choice.id] })
                }
              >
                {text(choice.text)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="font-bold">{t('learn.q.storyEnd')}</p>
      )}
      {taken.length > 0 ? (
        <button type="button" className="key key-quiet self-start" onClick={() => onChange(null)}>
          {t('learn.q.restart')}
        </button>
      ) : null}
    </div>
  );
}

function Unsupported() {
  const t = useT();
  return <p className="rounded-control bg-sun/30 p-4">{t('learn.q.unsupported')}</p>;
}
