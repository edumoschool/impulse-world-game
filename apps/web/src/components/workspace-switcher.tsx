'use client';

import type { SessionView } from '@impulse/contracts';
import { useId, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useSwitchTenant } from '@/lib/session';

/** Shown only to adults who belong to more than one family or school. */
export function WorkspaceSwitcher({ session }: { session: SessionView }) {
  const t = useT();
  const id = useId();
  const switchTenant = useSwitchTenant();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (session.tenants.length < 2) {
    return null;
  }

  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="sr-only">
        {t('common.workspace')}
      </label>
      <select
        id={id}
        value={session.activeTenantId ?? ''}
        disabled={busy}
        onChange={async (event) => {
          setBusy(true);
          setFailed(false);
          try {
            await switchTenant(event.target.value);
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
        className="min-h-11 max-w-56 rounded-control border-2 border-current bg-transparent px-3 font-medium"
      >
        {session.tenants.map((tenant) => (
          <option key={tenant.tenantId} value={tenant.tenantId} className="text-ink">
            {tenant.tenantName}
          </option>
        ))}
      </select>
      {failed ? (
        <p role="alert" className="mt-1 text-sm font-medium">
          {t('dashboard.switchFailed')}
        </p>
      ) : null}
    </div>
  );
}
