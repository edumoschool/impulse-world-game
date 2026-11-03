import type { MasteryLevel } from '@impulse/contracts';

/** Thresholds for the mastery model (spec 9.4: configurable). Accuracy runs from 0 to 1. */
export interface MasteryModel {
  /** How many of the most recent observations the accuracy is taken over. */
  window: number;
  /** Below this many observations a skill is only INTRODUCED, however well it went. */
  minObservations: number;
  developingAt: number;
  proficientAt: number;
  masteredAt: number;
  /** MASTERED needs at least this many observations in total... */
  masteredMinObservations: number;
  /** ...from at least this many separate attempts, so one long test cannot master a skill. */
  masteredMinSources: number;
}

export const DEFAULT_MASTERY_MODEL: MasteryModel = {
  window: 10,
  minObservations: 3,
  developingAt: 0.5,
  proficientAt: 0.7,
  masteredAt: 0.85,
  masteredMinObservations: 6,
  masteredMinSources: 2,
};

export interface Observation {
  score: number;
  sourceId: string;
  observedAt: Date;
}

export interface MasteryAssessment {
  level: MasteryLevel;
  recentAccuracy: number;
  observationCount: number;
}

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Places a learner on the mastery scale from several observations, never from one answer
 * (spec 9.4). Accuracy is taken over the recent window only, so a skill can fall back when
 * recent work is weak, which is what flags it for revision.
 *
 * @param recent observations in any order; only the newest `model.window` are used
 * @param total every observation of this skill by this learner, including older ones
 */
export function assessMastery(
  recent: readonly Observation[],
  total: number,
  model: MasteryModel = DEFAULT_MASTERY_MODEL,
): MasteryAssessment {
  if (total === 0 || recent.length === 0) {
    return { level: 'NOT_STARTED', recentAccuracy: 0, observationCount: 0 };
  }
  const window = [...recent]
    .sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())
    .slice(0, model.window);
  const recentAccuracy = round(window.reduce((sum, o) => sum + o.score, 0) / window.length);
  const sources = new Set(window.map((o) => o.sourceId)).size;

  let level: MasteryLevel;
  if (total < model.minObservations) {
    level = 'INTRODUCED';
  } else if (recentAccuracy < model.developingAt) {
    level = 'PRACTICING';
  } else if (recentAccuracy < model.proficientAt) {
    level = 'DEVELOPING';
  } else if (
    recentAccuracy >= model.masteredAt &&
    total >= model.masteredMinObservations &&
    sources >= model.masteredMinSources
  ) {
    level = 'MASTERED';
  } else {
    level = 'PROFICIENT';
  }
  return { level, recentAccuracy, observationCount: total };
}
