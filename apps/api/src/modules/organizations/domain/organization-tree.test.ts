import { describe, expect, it } from 'vitest';
import { canCreateUnit } from './organization-tree.js';

describe('canCreateUnit', () => {
  it('places branches only under the root', () => {
    expect(canCreateUnit({ kind: 'ROOT' }, 'BRANCH')).toBe(true);
    expect(canCreateUnit({ kind: 'BRANCH' }, 'BRANCH')).toBe(false);
    expect(canCreateUnit({ kind: 'DEPARTMENT' }, 'BRANCH')).toBe(false);
  });

  it('places departments under the root or a branch, never another department', () => {
    expect(canCreateUnit({ kind: 'ROOT' }, 'DEPARTMENT')).toBe(true);
    expect(canCreateUnit({ kind: 'BRANCH' }, 'DEPARTMENT')).toBe(true);
    expect(canCreateUnit({ kind: 'DEPARTMENT' }, 'DEPARTMENT')).toBe(false);
  });
});
