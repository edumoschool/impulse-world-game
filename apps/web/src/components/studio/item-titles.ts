import type {
  AssessmentView,
  ContentState,
  LearningPathView,
  LessonView,
  LocalizedText,
  QuestionView,
} from '@impulse/contracts';

export type AnyView = QuestionView | LessonView | AssessmentView | LearningPathView;

/** The newest version's title, or a question's prompt. */
export function titleOf(view: AnyView): LocalizedText {
  const latest = view.versions[0];
  if (!latest) {
    return { en: '—' };
  }
  if ('definition' in latest) {
    return latest.definition.prompt;
  }
  return latest.content.title;
}

export const latestState = (view: AnyView): ContentState | undefined => view.versions[0]?.state;
