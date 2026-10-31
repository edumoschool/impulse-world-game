'use client';

import type { SessionView } from '@impulse/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { api, ApiError, setCsrfToken } from './api';

export const SESSION_KEY = ['session'] as const;

async function loadSession(): Promise<SessionView | null> {
  try {
    const session = await api<SessionView>('/auth/session');
    setCsrfToken(session.csrfToken);
    return session;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export function useSession() {
  return useQuery({ queryKey: SESSION_KEY, queryFn: loadSession, staleTime: 60_000 });
}

/** Display routing only. The API authorizes every request regardless of what this does. */
export function homeFor(session: SessionView): string {
  return session.user.kind === 'CHILD' ? '/play' : '/dashboard';
}

export function useRequireSession(kind: SessionView['user']['kind']) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.isPending || session.isError) {
      return;
    }
    if (!session.data) {
      router.replace('/sign-in');
    } else if (session.data.user.kind !== kind) {
      router.replace(homeFor(session.data));
    }
  }, [kind, router, session.data, session.isError, session.isPending]);

  return session.data?.user.kind === kind ? session.data : null;
}

export function useSignOut() {
  const client = useQueryClient();
  const router = useRouter();

  return useCallback(async () => {
    await api('/auth/logout', 'POST').catch(() => undefined);
    setCsrfToken(undefined);
    client.clear();
    router.replace('/sign-in');
  }, [client, router]);
}

/**
 * Moves the session to another of the user's tenants. The API checks membership; the list shown
 * here only comes from the session view, so it cannot offer a tenant the user does not belong to.
 */
export function useSwitchTenant() {
  const client = useQueryClient();

  return useCallback(
    async (tenantId: string) => {
      const view = await api<SessionView>('/auth/switch-tenant', 'POST', { tenantId });
      const previous = client.getQueryData<SessionView>(SESSION_KEY);
      // The CSRF token belongs to the session, which a switch keeps, so it carries over.
      client.setQueryData<SessionView>(SESSION_KEY, {
        ...view,
        csrfToken: view.csrfToken ?? previous?.csrfToken,
      });
      await client.resetQueries({ predicate: (query) => query.queryKey[0] !== SESSION_KEY[0] });
    },
    [client],
  );
}
