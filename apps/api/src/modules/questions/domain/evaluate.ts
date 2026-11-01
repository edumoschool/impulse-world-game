import type { Evaluation, QuestionDefinition, QuestionResponse } from '@impulse/contracts';

const scored = (score: number): Evaluation => {
  const bounded = Math.min(1, Math.max(0, score));
  // Rounded so that floating error never turns a full marks answer into 0.9999.
  const rounded = Math.round(bounded * 10_000) / 10_000;
  return { status: 'SCORED', score: rounded, correct: rounded === 1 };
};
const WRONG = scored(0);
const NEEDS_REVIEW: Evaluation = { status: 'NEEDS_REVIEW' };

/** Trims, collapses inner spaces and folds case unless asked not to. Unicode-normalized. */
export function normalizeAnswer(value: string, caseSensitive = false): string {
  const collapsed = value.normalize('NFC').trim().replace(/\s+/g, ' ');
  return caseSensitive ? collapsed : collapsed.toLocaleLowerCase();
}

/** Share of expected pairs that the response got, counting each expected pair once. */
function pairShare<T>(expected: T[], given: T[], key: (item: T) => string): number {
  const wanted = new Set(expected.map(key));
  const hits = new Set(given.map(key).filter((value) => wanted.has(value)));
  // Extra wrong pairs are already excluded by the one-answer-per-item check below.
  return wanted.size === 0 ? 0 : hits.size / wanted.size;
}

/** Each left item (or drag item) may be answered once; a response that repeats one is invalid. */
function answersEachOnce(keys: string[]): boolean {
  return new Set(keys).size === keys.length;
}

/**
 * Marks one response against the question version it was asked from. The server is the only
 * place this runs: clients never decide correctness. A response of the wrong type scores 0.
 */
export function evaluate(question: QuestionDefinition, response: QuestionResponse): Evaluation {
  if (question.type !== response.type) {
    return WRONG;
  }
  switch (question.type) {
    case 'MULTIPLE_CHOICE': {
      const given = response as Extract<QuestionResponse, { type: 'MULTIPLE_CHOICE' }>;
      return scored(given.optionId === question.answer.correctOptionId ? 1 : 0);
    }
    case 'MULTIPLE_SELECT': {
      // Each right pick earns a share, each wrong pick costs one, never below zero. Selecting
      // everything therefore scores no better than guessing.
      const given = new Set(
        (response as Extract<QuestionResponse, { type: 'MULTIPLE_SELECT' }>).optionIds,
      );
      const correct = new Set(question.answer.correctOptionIds);
      let right = 0;
      let wrong = 0;
      for (const optionId of given) {
        if (correct.has(optionId)) {
          right += 1;
        } else {
          wrong += 1;
        }
      }
      return scored((right - wrong) / correct.size);
    }
    case 'TRUE_FALSE': {
      const given = response as Extract<QuestionResponse, { type: 'TRUE_FALSE' }>;
      return scored(given.value === question.answer.correct ? 1 : 0);
    }
    case 'MATCHING': {
      const given = (response as Extract<QuestionResponse, { type: 'MATCHING' }>).pairs;
      if (!answersEachOnce(given.map((pair) => pair.leftId))) {
        return WRONG;
      }
      return scored(
        pairShare(question.answer.pairs, given, (pair) => `${pair.leftId}->${pair.rightId}`),
      );
    }
    case 'ORDERING': {
      const given = (response as Extract<QuestionResponse, { type: 'ORDERING' }>).orderedIds;
      const expected = question.answer.orderedIds;
      if (given.length !== expected.length || !answersEachOnce(given)) {
        return WRONG;
      }
      const inPlace = expected.filter((itemId, index) => given[index] === itemId).length;
      return scored(inPlace / expected.length);
    }
    case 'DRAG_AND_DROP': {
      const given = (response as Extract<QuestionResponse, { type: 'DRAG_AND_DROP' }>).placements;
      if (!answersEachOnce(given.map((placement) => placement.itemId))) {
        return WRONG;
      }
      return scored(
        pairShare(question.answer.placements, given, (p) => `${p.itemId}->${p.zoneId}`),
      );
    }
    case 'FILL_IN_BLANK': {
      const given = new Map(
        (response as Extract<QuestionResponse, { type: 'FILL_IN_BLANK' }>).blanks.map((blank) => [
          blank.id,
          blank.value,
        ]),
      );
      const blanks = question.answer.blanks;
      const right = blanks.filter((blank) => {
        const value = given.get(blank.id);
        return (
          value !== undefined &&
          blank.accepted.some(
            (accepted) =>
              normalizeAnswer(accepted, blank.caseSensitive) ===
              normalizeAnswer(value, blank.caseSensitive),
          )
        );
      }).length;
      return scored(right / blanks.length);
    }
    case 'SHORT_TEXT': {
      const text = normalizeAnswer(
        (response as Extract<QuestionResponse, { type: 'SHORT_TEXT' }>).text,
      );
      if (text === '') {
        return WRONG;
      }
      const matched = question.answer.accepted.some(
        (accepted) => normalizeAnswer(accepted) === text,
      );
      // An unmatched answer may still be right in other words, so a person decides.
      return matched ? scored(1) : NEEDS_REVIEW;
    }
    case 'AUDIO_RESPONSE':
      return NEEDS_REVIEW;
    case 'IMAGE_HOTSPOT': {
      const { x, y } = response as Extract<QuestionResponse, { type: 'IMAGE_HOTSPOT' }>;
      const correct = new Set(question.answer.correctRegionIds);
      const hit = question.regions.some(
        (region) =>
          correct.has(region.id) &&
          x >= region.x &&
          x <= region.x + region.width &&
          y >= region.y &&
          y <= region.y + region.height,
      );
      return scored(hit ? 1 : 0);
    }
    case 'INTERACTIVE_SCENARIO':
      return evaluateScenario(
        question,
        (response as Extract<QuestionResponse, { type: 'INTERACTIVE_SCENARIO' }>).choiceIds,
      );
  }
}

/**
 * Follows the learner's choices from the start node. The path must be one the scenario allows
 * and must reach an ending, otherwise it scores 0. The score is the average choice score.
 */
function evaluateScenario(
  question: Extract<QuestionDefinition, { type: 'INTERACTIVE_SCENARIO' }>,
  choiceIds: string[],
): Evaluation {
  const nodes = new Map(question.nodes.map((node) => [node.id, node]));
  let node = nodes.get(question.startNodeId);
  const scores: number[] = [];
  for (const choiceId of choiceIds) {
    const picked = node?.choices.find((choice) => choice.id === choiceId);
    if (!node || !picked) {
      return WRONG;
    }
    scores.push(question.answer.choiceScores[picked.id] ?? 0);
    node = picked.next ? nodes.get(picked.next) : undefined;
  }
  // Not finished: the last choice still leads somewhere.
  if (node !== undefined || scores.length === 0) {
    return WRONG;
  }
  return scored(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}
