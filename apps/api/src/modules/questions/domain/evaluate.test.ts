import {
  QUESTION_TYPES,
  type QuestionDefinition,
  questionDefinitionSchema,
  type QuestionResponse,
} from '@impulse/contracts';
import { describe, expect, it } from 'vitest';
import { definitionProblems } from './definition.js';
import { evaluate, normalizeAnswer } from './evaluate.js';
import { toLearnerQuestion } from './learner-view.js';

const t = (en: string) => ({ en });
const opts = (...ids: string[]) => ids.map((id) => ({ id, text: t(id) }));
const define = (value: unknown) => questionDefinitionSchema.parse(value);
const full = { status: 'SCORED', score: 1, correct: true };
const none = { status: 'SCORED', score: 0, correct: false };
const partial = (score: number) => ({ status: 'SCORED', score, correct: false });

/** One valid question of every type, used by the cross-type checks at the bottom. */
const SAMPLES: Record<string, QuestionDefinition> = {
  MULTIPLE_CHOICE: define({
    type: 'MULTIPLE_CHOICE',
    prompt: t('2 + 2?'),
    options: opts('three', 'four'),
    answer: { correctOptionId: 'four' },
  }),
  MULTIPLE_SELECT: define({
    type: 'MULTIPLE_SELECT',
    prompt: t('Pick the even numbers'),
    options: opts('1', '2', '3', '4'),
    answer: { correctOptionIds: ['2', '4'] },
  }),
  TRUE_FALSE: define({ type: 'TRUE_FALSE', prompt: t('Ice is cold'), answer: { correct: true } }),
  MATCHING: define({
    type: 'MATCHING',
    prompt: t('Match the animal to its home'),
    left: opts('bee', 'bird', 'fish'),
    right: opts('hive', 'nest', 'sea'),
    answer: {
      pairs: [
        { leftId: 'bee', rightId: 'hive' },
        { leftId: 'bird', rightId: 'nest' },
        { leftId: 'fish', rightId: 'sea' },
      ],
    },
  }),
  ORDERING: define({
    type: 'ORDERING',
    prompt: t('Smallest first'),
    items: opts('one', 'two', 'three', 'four'),
    answer: { orderedIds: ['one', 'two', 'three', 'four'] },
  }),
  DRAG_AND_DROP: define({
    type: 'DRAG_AND_DROP',
    prompt: t('Sort the fruit and vegetables'),
    zones: opts('fruit', 'veg'),
    items: opts('apple', 'carrot'),
    answer: {
      placements: [
        { itemId: 'apple', zoneId: 'fruit' },
        { itemId: 'carrot', zoneId: 'veg' },
      ],
    },
  }),
  FILL_IN_BLANK: define({
    type: 'FILL_IN_BLANK',
    prompt: t('Fill in the capital cities'),
    text: { en: 'The capital of Uzbekistan is {{a}} and of France is {{b}}.' },
    answer: {
      blanks: [
        { id: 'a', accepted: ['Tashkent', 'Toshkent'] },
        { id: 'b', accepted: ['Paris'] },
      ],
    },
  }),
  SHORT_TEXT: define({
    type: 'SHORT_TEXT',
    prompt: t('What do plants need from the sun?'),
    answer: { accepted: ['light', 'sunlight'] },
  }),
  AUDIO_RESPONSE: define({ type: 'AUDIO_RESPONSE', prompt: t('Say hello'), answer: {} }),
  IMAGE_HOTSPOT: define({
    type: 'IMAGE_HOTSPOT',
    prompt: t('Tap the cat'),
    image: 'images/farm.png',
    regions: [
      { id: 'cat', x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      { id: 'dog', x: 0.6, y: 0.6, width: 0.2, height: 0.2 },
    ],
    answer: { correctRegionIds: ['cat'] },
  }),
  INTERACTIVE_SCENARIO: define({
    type: 'INTERACTIVE_SCENARIO',
    prompt: t('You find a lost wallet'),
    startNodeId: 'start',
    nodes: [
      {
        id: 'start',
        text: t('What do you do?'),
        choices: [
          { id: 'keep', text: t('Keep it') },
          { id: 'tell', text: t('Tell a grown-up'), next: 'next' },
        ],
      },
      {
        id: 'next',
        text: t('The grown-up asks you to help'),
        choices: [
          { id: 'help', text: t('Help find the owner') },
          { id: 'leave', text: t('Go home') },
        ],
      },
    ],
    answer: { choiceScores: { keep: 0, tell: 1, help: 1, leave: 0.5 } },
  }),
};
const sample = <T extends QuestionDefinition['type']>(type: T) =>
  SAMPLES[type] as Extract<QuestionDefinition, { type: T }>;
const answer = (response: QuestionResponse) =>
  evaluate(SAMPLES[response.type] as QuestionDefinition, response);

describe('evaluate', () => {
  it('multiple choice: one right option', () => {
    expect(answer({ type: 'MULTIPLE_CHOICE', optionId: 'four' })).toEqual(full);
    expect(answer({ type: 'MULTIPLE_CHOICE', optionId: 'three' })).toEqual(none);
  });

  it('multiple select: partial credit, and choosing everything does not pay', () => {
    expect(answer({ type: 'MULTIPLE_SELECT', optionIds: ['2', '4'] })).toEqual(full);
    expect(answer({ type: 'MULTIPLE_SELECT', optionIds: ['2'] })).toEqual(partial(0.5));
    expect(answer({ type: 'MULTIPLE_SELECT', optionIds: ['1', '2', '3', '4'] })).toEqual(none);
    expect(answer({ type: 'MULTIPLE_SELECT', optionIds: ['2', '2', '4'] })).toEqual(full);
    expect(answer({ type: 'MULTIPLE_SELECT', optionIds: [] })).toEqual(none);
  });

  it('true or false', () => {
    expect(answer({ type: 'TRUE_FALSE', value: true })).toEqual(full);
    expect(answer({ type: 'TRUE_FALSE', value: false })).toEqual(none);
  });

  it('matching: a share per right pair, and no credit for matching one item twice', () => {
    const pairs = sample('MATCHING').answer.pairs;
    expect(answer({ type: 'MATCHING', pairs })).toEqual(full);
    expect(
      answer({
        type: 'MATCHING',
        pairs: [
          { leftId: 'bee', rightId: 'hive' },
          { leftId: 'bird', rightId: 'sea' },
          { leftId: 'fish', rightId: 'nest' },
        ],
      }),
    ).toEqual(partial(0.3333));
    expect(
      answer({
        type: 'MATCHING',
        pairs: [
          { leftId: 'bee', rightId: 'hive' },
          { leftId: 'bee', rightId: 'nest' },
        ],
      }),
    ).toEqual(none);
  });

  it('ordering: a share per item in place, and incomplete orders score nothing', () => {
    expect(answer({ type: 'ORDERING', orderedIds: ['one', 'two', 'three', 'four'] })).toEqual(full);
    expect(answer({ type: 'ORDERING', orderedIds: ['one', 'two', 'four', 'three'] })).toEqual(
      partial(0.5),
    );
    expect(answer({ type: 'ORDERING', orderedIds: ['one', 'two', 'three'] })).toEqual(none);
    expect(answer({ type: 'ORDERING', orderedIds: ['one', 'one', 'one', 'one'] })).toEqual(none);
  });

  it('drag and drop: a share per right placement', () => {
    expect(
      answer({
        type: 'DRAG_AND_DROP',
        placements: [
          { itemId: 'apple', zoneId: 'fruit' },
          { itemId: 'carrot', zoneId: 'fruit' },
        ],
      }),
    ).toEqual(partial(0.5));
    expect(
      answer({
        type: 'DRAG_AND_DROP',
        placements: sample('DRAG_AND_DROP').answer.placements,
      }),
    ).toEqual(full);
  });

  it('fill in the blank: forgiving about case and spacing, unless told otherwise', () => {
    expect(
      answer({
        type: 'FILL_IN_BLANK',
        blanks: [
          { id: 'a', value: '  toshkent ' },
          { id: 'b', value: 'PARIS' },
        ],
      }),
    ).toEqual(full);
    expect(answer({ type: 'FILL_IN_BLANK', blanks: [{ id: 'a', value: 'Tashkent' }] })).toEqual(
      partial(0.5),
    );
    const strict = define({
      ...sample('FILL_IN_BLANK'),
      text: { en: '{{a}}' },
      answer: { blanks: [{ id: 'a', accepted: ['H2O'], caseSensitive: true }] },
    });
    expect(
      evaluate(strict, { type: 'FILL_IN_BLANK', blanks: [{ id: 'a', value: 'h2o' }] }),
    ).toEqual(none);
  });

  it('short text: an accepted answer scores, anything else goes to a person', () => {
    expect(answer({ type: 'SHORT_TEXT', text: 'Sunlight' })).toEqual(full);
    expect(answer({ type: 'SHORT_TEXT', text: 'energy from light' })).toEqual({
      status: 'NEEDS_REVIEW',
    });
    expect(answer({ type: 'SHORT_TEXT', text: '   ' })).toEqual(none);
  });

  it('audio always goes to a person', () => {
    expect(answer({ type: 'AUDIO_RESPONSE', audioAsset: 'audio/1.webm' })).toEqual({
      status: 'NEEDS_REVIEW',
    });
  });

  it('image hotspot: a tap inside a correct region, edges included', () => {
    expect(answer({ type: 'IMAGE_HOTSPOT', x: 0.15, y: 0.2 })).toEqual(full);
    expect(answer({ type: 'IMAGE_HOTSPOT', x: 0.3, y: 0.3 })).toEqual(full);
    expect(answer({ type: 'IMAGE_HOTSPOT', x: 0.7, y: 0.7 })).toEqual(none);
  });

  it('scenario: the average along a valid, finished path', () => {
    expect(answer({ type: 'INTERACTIVE_SCENARIO', choiceIds: ['tell', 'help'] })).toEqual(full);
    expect(answer({ type: 'INTERACTIVE_SCENARIO', choiceIds: ['tell', 'leave'] })).toEqual(
      partial(0.75),
    );
    expect(answer({ type: 'INTERACTIVE_SCENARIO', choiceIds: ['keep'] })).toEqual(none);
    // Unfinished, impossible and invented paths score nothing.
    expect(answer({ type: 'INTERACTIVE_SCENARIO', choiceIds: ['tell'] })).toEqual(none);
    expect(answer({ type: 'INTERACTIVE_SCENARIO', choiceIds: ['help'] })).toEqual(none);
    expect(answer({ type: 'INTERACTIVE_SCENARIO', choiceIds: ['keep', 'help'] })).toEqual(none);
  });

  it('scores a response of the wrong type as zero, for every type', () => {
    for (const type of QUESTION_TYPES) {
      const other: QuestionResponse =
        type === 'TRUE_FALSE'
          ? { type: 'MULTIPLE_CHOICE', optionId: 'x' }
          : { type: 'TRUE_FALSE', value: true };
      expect(evaluate(SAMPLES[type] as QuestionDefinition, other)).toEqual(none);
    }
  });

  it('normalizes answers', () => {
    expect(normalizeAnswer('  O‘zbekiston   Respublikasi ')).toBe('o‘zbekiston respublikasi');
  });
});

describe('definitionProblems', () => {
  it('accepts every sample question', () => {
    for (const type of QUESTION_TYPES) {
      expect(definitionProblems(SAMPLES[type] as QuestionDefinition), type).toEqual([]);
    }
  });

  it('catches answer keys that point at nothing', () => {
    expect(
      definitionProblems(
        define({ ...sample('MULTIPLE_CHOICE'), answer: { correctOptionId: 'x' } }),
      ),
    ).toHaveLength(1);
    expect(
      definitionProblems(
        define({ ...sample('ORDERING'), answer: { orderedIds: ['one', 'two', 'two', 'four'] } }),
      ),
    ).toHaveLength(1);
    expect(
      definitionProblems(define({ ...sample('FILL_IN_BLANK'), text: { en: 'No blanks here' } })),
    ).toHaveLength(1);
  });

  it('refuses scenarios that loop, dead-end into nothing, or miss scores', () => {
    const looping = define({
      ...sample('INTERACTIVE_SCENARIO'),
      nodes: [{ id: 'start', text: t('a'), choices: [{ id: 'go', text: t('go'), next: 'start' }] }],
      answer: { choiceScores: { go: 1 } },
    });
    expect(definitionProblems(looping)).toContain('The scenario must not loop back on itself');
    const broken = define({
      ...sample('INTERACTIVE_SCENARIO'),
      nodes: [
        { id: 'start', text: t('a'), choices: [{ id: 'go', text: t('go'), next: 'nowhere' }] },
      ],
      answer: { choiceScores: {} },
    });
    expect(definitionProblems(broken)).toEqual([
      'Choice go has no score',
      'Choice go leads to a missing step',
    ]);
  });
});

describe('toLearnerQuestion', () => {
  it('never includes the answer key, for any type', () => {
    for (const type of QUESTION_TYPES) {
      const view = toLearnerQuestion(SAMPLES[type] as QuestionDefinition, 'attempt-1');
      expect(JSON.stringify(view), type).not.toContain('"answer"');
      expect(JSON.stringify(view), type).not.toContain('choiceScores');
    }
  });

  it('shuffles orderable items the same way for the same seed', () => {
    const question = sample('ORDERING');
    const first = toLearnerQuestion(question, 'attempt-1');
    const again = toLearnerQuestion(question, 'attempt-1');
    expect(again).toEqual(first);
    const ids = (view: typeof first) =>
      (view as { items: { id: string }[] }).items.map((item) => item.id);
    expect([...ids(first)].sort()).toEqual(['four', 'one', 'three', 'two']);
    const orders = new Set(
      Array.from({ length: 20 }, (_, index) =>
        ids(toLearnerQuestion(question, `seed-${index}`)).join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
