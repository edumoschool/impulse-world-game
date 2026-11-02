import type { AttemptItemResult, Evaluation, ResponseOutcome } from '@impulse/contracts';

export interface MarkedItem {
  id: string;
  points: number;
  /** The evaluator's verdict on the learner's response, or null if they left it unanswered. */
  evaluation: Evaluation | null;
}

export interface AttemptScore {
  items: AttemptItemResult[];
  earnedPoints: number;
  maxPoints: number;
  /** earnedPoints over maxPoints. Items waiting for a person count as zero until marked. */
  score: number;
  pendingReview: number;
  /** Null while any item waits for a person, since marking it could still change the outcome. */
  passed: boolean | null;
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

function outcomeOf(evaluation: Evaluation | null): ResponseOutcome {
  if (!evaluation) {
    return 'UNANSWERED';
  }
  if (evaluation.status === 'NEEDS_REVIEW') {
    return 'NEEDS_REVIEW';
  }
  if (evaluation.score === 1) {
    return 'CORRECT';
  }
  return evaluation.score === 0 ? 'INCORRECT' : 'PARTIAL';
}

/**
 * Totals an attempt from per-item evaluations, weighting each by its points. Pure, so the same
 * responses always give the same result, and only the server ever calls it.
 */
export function scoreAttempt(items: readonly MarkedItem[], passingScore: number): AttemptScore {
  let earned = 0;
  let max = 0;
  let pending = 0;
  const results = items.map((item): AttemptItemResult => {
    max += item.points;
    const outcome = outcomeOf(item.evaluation);
    if (item.evaluation?.status === 'NEEDS_REVIEW') {
      pending += 1;
      return { itemId: item.id, outcome, score: null };
    }
    const score = item.evaluation?.score ?? 0;
    earned += score * item.points;
    return { itemId: item.id, outcome, score };
  });
  const earnedPoints = round(earned);
  const score = max === 0 ? 0 : round(earnedPoints / max);
  return {
    items: results,
    earnedPoints,
    maxPoints: max,
    score,
    pendingReview: pending,
    passed: pending > 0 ? null : score >= passingScore,
  };
}
