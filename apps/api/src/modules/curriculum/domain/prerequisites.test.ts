import { describe, expect, it } from 'vitest';
import { wouldCreateCycle } from './prerequisites.js';

const edge = (skillId: string, prerequisiteId: string) => ({ skillId, prerequisiteId });

describe('wouldCreateCycle', () => {
  it('refuses a skill as its own prerequisite', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
  });

  it('refuses a direct loop', () => {
    expect(wouldCreateCycle([edge('b', 'a')], 'a', 'b')).toBe(true);
  });

  it('refuses a long loop', () => {
    const chain = [edge('d', 'c'), edge('c', 'b'), edge('b', 'a')];
    expect(wouldCreateCycle(chain, 'a', 'd')).toBe(true);
  });

  it('allows a shared prerequisite (a diamond is not a loop)', () => {
    const diamond = [edge('b', 'a'), edge('c', 'a'), edge('d', 'b')];
    expect(wouldCreateCycle(diamond, 'd', 'c')).toBe(false);
  });

  it('terminates on graphs that already contain a loop', () => {
    expect(wouldCreateCycle([edge('x', 'y'), edge('y', 'x')], 'a', 'x')).toBe(false);
  });
});
