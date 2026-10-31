'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { homeFor, useSession } from '@/lib/session';

export default function Home() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.isPending) {
      return;
    }
    router.replace(session.data ? homeFor(session.data) : '/sign-in');
  }, [router, session.data, session.isPending]);

  return <div className="min-h-dvh bg-sky" />;
}
