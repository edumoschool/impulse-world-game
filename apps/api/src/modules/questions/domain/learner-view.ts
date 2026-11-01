import type { QuestionDefinition } from '@impulse/contracts';

/** What a learner may see of a question: everything except the answer key. */
export type LearnerQuestion = DistributiveOmit<QuestionDefinition, 'answer'>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function withoutAnswer(question: QuestionDefinition): LearnerQuestion {
  const copy: Partial<QuestionDefinition> = { ...question };
  delete copy.answer;
  return copy as LearnerQuestion;
}

/** Mulberry32: small, fast and deterministic, so one attempt always sees the same order. */
function seededRandom(seed: string): () => number {
  let state = 0;
  for (const char of seed) {
    state = (Math.imul(31, state) + char.charCodeAt(0)) | 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap] as T, copy[index] as T];
  }
  return copy;
}

/**
 * Strips the answer key, and shuffles anything whose authored order could give the answer away.
 * The seed is usually the attempt id, so a reload shows the same order.
 */
export function toLearnerQuestion(question: QuestionDefinition, seed: string): LearnerQuestion {
  const random = seededRandom(seed);
  const visible = withoutAnswer(question);
  switch (visible.type) {
    case 'ORDERING':
      return { ...visible, items: shuffled(visible.items, random) };
    case 'MATCHING':
      return { ...visible, right: shuffled(visible.right, random) };
    case 'DRAG_AND_DROP':
      return { ...visible, items: shuffled(visible.items, random) };
    default:
      return visible;
  }
}
