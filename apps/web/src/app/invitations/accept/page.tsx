'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AdultShell } from '@/components/adult-shell';
import { Field } from '@/components/field';
import { FormAlert } from '@/components/form-alert';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { SESSION_KEY, useRequireSession, useSwitchTenant } from '@/lib/session';

const schema = z.object({
  // Pasted from an email, so stray spaces and line breaks are removed before sending.
  token: z
    .string()
    .transform((value) => value.replace(/\s+/g, ''))
    .pipe(z.string().min(32, 'validation.required')),
});

export default function AcceptInvitationPage() {
  const t = useT();
  const router = useRouter();
  const client = useQueryClient();
  const session = useRequireSession('ADULT');
  const switchTenant = useSwitchTenant();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;

  if (!session) {
    return null;
  }

  const submit = form.handleSubmit(async ({ token }) => {
    setFailure(undefined);
    let tenantId: string;
    try {
      ({ tenantId } = await api<{ tenantId: string }>('/invitations/accept', 'POST', { token }));
    } catch (error) {
      setFailure(t(errorKey(error)));
      return;
    }
    // The membership exists now. If opening it fails, the switcher still lists it.
    await switchTenant(tenantId).catch(() => client.invalidateQueries({ queryKey: SESSION_KEY }));
    router.replace('/dashboard');
  });

  return (
    <AdultShell session={session}>
      <h1 className="font-display text-3xl font-bold">{t('invitation.title')}</h1>
      <p className="mt-2 max-w-prose text-ink-soft">{t('invitation.lead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 flex max-w-md flex-col gap-5">
        <FormAlert>{failure}</FormAlert>
        <Field
          label={t('field.invitationCode')}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.token ? t('validation.required') : undefined}
          {...form.register('token')}
        />
        <button type="submit" className="key" disabled={isSubmitting}>
          {t('invitation.submit')}
        </button>
      </form>
      <p className="mt-12">
        <Link href="/dashboard" className="font-medium underline underline-offset-4">
          {t('common.back')}
        </Link>
      </p>
    </AdultShell>
  );
}
