import { describe, expect, it } from 'vitest';
import { assessMastery, type Observation } from './mastery.js';

let clock = Date.UTC(2026, 10, 1);
/** Observations in time order, each a second after the last. */
const observe = (scores: number[], sourceId = 'attempt-1'): Observation[] =>
  scores.map((score) => ({ score, sourceId, observedAt: new Date((clock += 1000)) }));

describe('assessMastery', () => {
  it('starts at NOT_STARTED with no evidence', () => {
    expect(assessMastery([], 0)).toEqual({
      level: 'NOT_STARTED',
      recentAccuracy: 0,
      observationCount: 0,
    });
  });

  it('never goes past INTRODUCED on one or two correct answers', () => {
    expect(assessMastery(observe([1]), 1).level).toBe('INTRODUCED');
    expect(assessMastery(observe([1, 1]), 2).level).toBe('INTRODUCED');
  });

  it('moves through the levels with recent accuracy', () => {
    expect(assessMastery(observe([0, 0, 1]), 3).level).toBe('PRACTICING');
    expect(assessMastery(observe([1, 0, 0.5, 1]), 4).level).toBe('DEVELOPING');
    expect(assessMastery(observe([1, 1, 0.5, 1]), 4).level).toBe('PROFICIENT');
  });

  it('needs enough observations from more than one attempt to reach MASTERED', () => {
    const oneSitting = observe([1, 1, 1, 1, 1, 1], 'attempt-1');
    expect(assessMastery(oneSitting, 6).level).toBe('PROFICIENT');
    const twoSittings = [...observe([1, 1, 1], 'attempt-1'), ...observe([1, 1, 1], 'attempt-2')];
    expect(assessMastery(twoSittings, 6).level).toBe('MASTERED');
    expect(assessMastery(twoSittings.slice(0, 5), 5).level).toBe('PROFICIENT');
  });

  it('falls back when recent work is weak, whatever came before', () => {
    const strongThenWeak = [
      ...observe([1, 1, 1, 1, 1], 'attempt-1'),
      ...observe([1, 1, 1, 1, 1], 'attempt-2'),
      ...observe([0, 0, 0, 0, 0, 0, 0], 'attempt-3'),
    ];
    const result = assessMastery(strongThenWeak, strongThenWeak.length);
    // Only the newest ten count: three 1s and seven 0s.
    expect(result).toMatchObject({
      level: 'PRACTICING',
      recentAccuracy: 0.3,
      observationCount: 17,
    });
  });

  it('does not depend on the order observations arrive in', () => {
    const items = [...observe([0, 0, 0], 'a'), ...observe([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'b')];
    expect(assessMastery([...items].reverse(), items.length)).toEqual(
      assessMastery(items, items.length),
    );
  });
});
