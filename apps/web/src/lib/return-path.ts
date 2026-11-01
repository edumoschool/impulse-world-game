'use client';

import { useEffect, useState } from 'react';

/**
 * Only same-site paths are accepted, so a crafted link cannot send someone to another site
 * after they sign in. "//host" and "/\host" are protocol-relative in browsers, so they are refused.
 */
export function isSafeReturnPath(value: string | null): value is string {
  return (
    value !== null &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/\\') &&
    value.length <= 2048
  );
}

/** Read at the moment of use, so pages need no Suspense boundary for search parameters. */
export function readReturnPath(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  return isSafeReturnPath(next) ? next : null;
}

export function withReturnPath(path: string, next: string | null): string {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}

/** The return path for building links. Null on the server and on the first client render. */
export function useReturnPath(): string | null {
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => setNext(readReturnPath()), []);
  return next;
}
