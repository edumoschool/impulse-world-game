export type UnitKind = 'ROOT' | 'BRANCH' | 'DEPARTMENT';

export interface UnitParent {
  kind: UnitKind;
}

/** Branches sit directly under the root. Departments sit under the root or a branch. */
export function canCreateUnit(parent: UnitParent, kind: 'BRANCH' | 'DEPARTMENT'): boolean {
  return kind === 'BRANCH' ? parent.kind === 'ROOT' : parent.kind !== 'DEPARTMENT';
}
