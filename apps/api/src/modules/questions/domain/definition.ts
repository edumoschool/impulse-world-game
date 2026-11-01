import type { QuestionDefinition } from '@impulse/contracts';

/**
 * Checks that an answer key fits its question, which the schema alone cannot see: every id in
 * the key must exist, and the question must be answerable. Returns problems for the author.
 */
export function definitionProblems(question: QuestionDefinition): string[] {
  const problems: string[] = [];
  const missing = (label: string, ids: string[], known: string[]) => {
    const unknown = ids.filter((value) => !known.includes(value));
    if (unknown.length > 0) {
      problems.push(`${label} refers to unknown ids: ${unknown.join(', ')}`);
    }
  };
  const ids = (items: { id: string }[]) => items.map((item) => item.id);

  switch (question.type) {
    case 'MULTIPLE_CHOICE':
      missing('The correct option', [question.answer.correctOptionId], ids(question.options));
      break;
    case 'MULTIPLE_SELECT':
      missing('The correct options', question.answer.correctOptionIds, ids(question.options));
      break;
    case 'MATCHING': {
      const pairs = question.answer.pairs;
      missing(
        'The pairs',
        pairs.map((p) => p.leftId),
        ids(question.left),
      );
      missing(
        'The pairs',
        pairs.map((p) => p.rightId),
        ids(question.right),
      );
      if (new Set(pairs.map((p) => p.leftId)).size !== pairs.length) {
        problems.push('Each left item can be matched only once');
      }
      break;
    }
    case 'ORDERING': {
      const order = question.answer.orderedIds;
      const items = ids(question.items);
      if (order.length !== items.length || [...order].sort().join() !== [...items].sort().join()) {
        problems.push('The order must list every item exactly once');
      }
      break;
    }
    case 'DRAG_AND_DROP': {
      const placements = question.answer.placements;
      missing(
        'The placements',
        placements.map((p) => p.itemId),
        ids(question.items),
      );
      missing(
        'The placements',
        placements.map((p) => p.zoneId),
        ids(question.zones),
      );
      if (new Set(placements.map((p) => p.itemId)).size !== placements.length) {
        problems.push('Each item can be placed only once');
      }
      break;
    }
    case 'FILL_IN_BLANK': {
      const blankIds = question.answer.blanks.map((blank) => blank.id);
      for (const [locale, text] of Object.entries(question.text)) {
        const markers = [...(text ?? '').matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]);
        if ([...markers].sort().join() !== [...blankIds].sort().join()) {
          problems.push(`The ${locale} text must contain each blank marker exactly once`);
        }
      }
      break;
    }
    case 'IMAGE_HOTSPOT':
      missing('The correct regions', question.answer.correctRegionIds, ids(question.regions));
      break;
    case 'INTERACTIVE_SCENARIO':
      problems.push(...scenarioProblems(question));
      break;
    case 'TRUE_FALSE':
    case 'SHORT_TEXT':
    case 'AUDIO_RESPONSE':
      break;
  }
  return problems;
}

function scenarioProblems(
  question: Extract<QuestionDefinition, { type: 'INTERACTIVE_SCENARIO' }>,
): string[] {
  const problems: string[] = [];
  const nodes = new Map(question.nodes.map((node) => [node.id, node]));
  if (nodes.size !== question.nodes.length) {
    problems.push('Scenario step ids must be unique');
  }
  if (!nodes.has(question.startNodeId)) {
    problems.push('The scenario must start at one of its steps');
    return problems;
  }
  const choiceIds = question.nodes.flatMap((node) => node.choices.map((choice) => choice.id));
  if (new Set(choiceIds).size !== choiceIds.length) {
    problems.push('Choice ids must be unique across the scenario');
  }
  for (const choiceId of choiceIds) {
    if (question.answer.choiceScores[choiceId] === undefined) {
      problems.push(`Choice ${choiceId} has no score`);
    }
  }
  for (const node of question.nodes) {
    for (const choice of node.choices) {
      if (choice.next && !nodes.has(choice.next)) {
        problems.push(`Choice ${choice.id} leads to a missing step`);
      }
    }
  }
  // A loop would let a learner play forever; every path must reach an ending.
  const visiting = new Set<string>();
  const done = new Set<string>();
  const hasLoop = (nodeId: string): boolean => {
    if (done.has(nodeId)) {
      return false;
    }
    if (visiting.has(nodeId)) {
      return true;
    }
    visiting.add(nodeId);
    const node = nodes.get(nodeId);
    const loops = (node?.choices ?? []).some(
      (choice) => choice.next !== undefined && nodes.has(choice.next) && hasLoop(choice.next),
    );
    visiting.delete(nodeId);
    done.add(nodeId);
    return loops;
  };
  if (hasLoop(question.startNodeId)) {
    problems.push('The scenario must not loop back on itself');
  }
  return problems;
}
