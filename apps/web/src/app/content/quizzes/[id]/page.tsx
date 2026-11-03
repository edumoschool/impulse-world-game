'use client';

import type { AssessmentContent } from '@impulse/contracts';
import { useParams } from 'next/navigation';
import { QuizEditor } from '@/components/studio/content-editors';
import { StudioItemPage } from '@/components/studio/item-page';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <StudioItemPage<AssessmentContent>
      kind="assessment"
      id={id}
      heading={{ create: 'studio.newQuiz', edit: 'studio.editQuiz' }}
      Editor={QuizEditor}
    />
  );
}
