'use client';

import type { LessonContent } from '@impulse/contracts';
import { useParams } from 'next/navigation';
import { LessonEditor } from '@/components/studio/content-editors';
import { StudioItemPage } from '@/components/studio/item-page';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <StudioItemPage<LessonContent>
      kind="lesson"
      id={id}
      heading={{ create: 'studio.newLesson', edit: 'studio.editLesson' }}
      Editor={LessonEditor}
    />
  );
}
