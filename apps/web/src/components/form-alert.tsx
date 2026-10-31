import type { ReactNode } from 'react';

export function FormAlert({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }
  return (
    <p role="alert" className="rounded-control bg-coral/15 px-4 py-3 font-medium text-danger">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-control bg-mint/20 px-4 py-3 font-medium">
      {children}
    </p>
  );
}
