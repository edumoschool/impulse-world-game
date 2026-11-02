import { describe, expect, it } from 'vitest';
import { scoreAttempt } from './scoring.js';

const scored = (score: number) => ({ status: 'SCORED' as const, score, correct: score === 1 });

describe('scoreAttempt', () => {
  it('weights each item by its points and names each outcome', () => {
    const result = scoreAttempt(
      [
        { id: 'a', points: 2, evaluation: scored(1) },
        { id: 'b', points: 1, evaluation: scored(0.5) },
        { id: 'c', points: 1, evaluation: scored(0) },
        { id: 'd', points: 1, evaluation: null },
      ],
      0.5,
    );
    expect(result.items.map((item) => item.outcome)).toEqual([
      'CORRECT',
      'PARTIAL',
      'INCORRECT',
      'UNANSWERED',
    ]);
    expect(result).toMatchObject({ earnedPoints: 2.5, maxPoints: 5, score: 0.5, passed: true });
  });

  it('fails below the pass mark, and passes exactly on it', () => {
    const items = [
      { id: 'a', points: 1, evaluation: scored(1) },
      { id: 'b', points: 2, evaluation: scored(0) },
    ];
    expect(scoreAttempt(items, 0.34).passed).toBe(false);
    expect(scoreAttempt(items, 0.3333).passed).toBe(true);
  });

  it('leaves the verdict open while an item waits for a person', () => {
    const result = scoreAttempt(
      [
        { id: 'a', points: 1, evaluation: scored(1) },
        { id: 'b', points: 1, evaluation: { status: 'NEEDS_REVIEW' } },
      ],
      0.5,
    );
    expect(result).toMatchObject({ score: 0.5, pendingReview: 1, passed: null });
    expect(result.items[1]).toEqual({ itemId: 'b', outcome: 'NEEDS_REVIEW', score: null });
  });

  it('never drifts above full marks through floating error', () => {
    const thirds = Array.from({ length: 3 }, (_, index) => ({
      id: String(index),
      points: 1,
      evaluation: scored(1),
    }));
    expect(scoreAttempt(thirds, 1)).toMatchObject({ score: 1, passed: true });
  });
});
