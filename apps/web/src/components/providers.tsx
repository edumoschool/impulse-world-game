'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useResolveLocale } from '@/lib/i18n';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  useResolveLocale();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
