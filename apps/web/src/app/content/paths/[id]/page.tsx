'use client';

import type { LearningPathContent } from '@impulse/contracts';
import { useParams } from 'next/navigation';
import { PathEditor } from '@/components/studio/content-editors';
import { StudioItemPage } from '@/components/studio/item-page';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <StudioItemPage<LearningPathContent>
      kind="path"
      id={id}
      heading={{ create: 'studio.newPath', edit: 'studio.editPath' }}
      Editor={PathEditor}
    />
  );
}
