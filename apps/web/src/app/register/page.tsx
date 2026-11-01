'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { AuthResult } from '@impulse/contracts';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Field } from '@/components/field';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { api, setCsrfToken } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { readReturnPath, useReturnPath, withReturnPath } from '@/lib/return-path';
import { SESSION_KEY } from '@/lib/session';

const schema = z.object({
  displayName: z.string().trim().min(1, 'validation.required'),
  email: z.email('validation.email'),
  password: z.string().min(12, 'validation.passwordLength'),
});

export default function RegisterPage() {
  const t = useT();
  const locale = useLocale();
  const next = useReturnPath();
  const client = useQueryClient();
  const router = useRouter();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;
  const message = (key?: string) => (key ? t(key as Parameters<typeof t>[0]) : undefined);

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      const result = await api<AuthResult>('/auth/register', 'POST', {
        ...values,
        locale,
        transport: 'cookie',
        deviceLabel: 'Web browser',
      });
      setCsrfToken(result.csrfToken);
      client.setQueryData(SESSION_KEY, result);
      router.replace(readReturnPath() ?? '/dashboard');
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-bold">{t('register.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('register.lead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        {next?.startsWith('/invitations/') ? (
          <FormNotice>{t('invitation.signInFirst')}</FormNotice>
        ) : null}
        <FormAlert>{failure}</FormAlert>
        <Field
          label={t('field.yourName')}
          autoComplete="name"
          error={message(errors.displayName?.message)}
          {...form.register('displayName')}
        />
        <Field
          label={t('field.email')}
          type="email"
          autoComplete="email"
          error={message(errors.email?.message)}
          {...form.register('email')}
        />
        <Field
          label={t('field.password')}
          type="password"
          autoComplete="new-password"
          hint={t('field.passwordHint')}
          error={message(errors.password?.message)}
          {...form.register('password')}
        />
        <button type="submit" className="key mt-2 w-full" disabled={isSubmitting}>
          {t('register.submit')}
        </button>
      </form>
      <p className="mt-6">
        {t('register.haveAccount')}{' '}
        <Link
          href={withReturnPath('/sign-in', next)}
          className="font-medium underline underline-offset-4"
        >
          {t('register.signIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
