export interface PrerequisiteEdge {
  skillId: string;
  prerequisiteId: string;
}

/**
 * Whether adding "skill needs prerequisite" would close a loop, which would make both skills
 * impossible to start. True when the skill is already reachable from the prerequisite.
 */
export function wouldCreateCycle(
  edges: readonly PrerequisiteEdge[],
  skillId: string,
  prerequisiteId: string,
): boolean {
  if (skillId === prerequisiteId) {
    return true;
  }
  const needs = new Map<string, string[]>();
  for (const edge of edges) {
    needs.set(edge.skillId, [...(needs.get(edge.skillId) ?? []), edge.prerequisiteId]);
  }
  const seen = new Set<string>();
  const stack = [prerequisiteId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === skillId) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    stack.push(...(needs.get(current) ?? []));
  }
  return false;
}
