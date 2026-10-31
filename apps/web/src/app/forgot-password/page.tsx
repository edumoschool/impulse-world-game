'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Field } from '@/components/field';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';

const schema = z.object({ email: z.email('validation.email') });

export default function ForgotPasswordPage() {
  const t = useT();
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      await api('/auth/password/forgot', 'POST', values);
      setSent(true);
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <AuthShell>
      <h1 className="font-display text-3xl font-bold">{t('forgot.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('forgot.lead')}</p>
      {sent ? (
        <div className="mt-8">
          <FormNotice>{t('forgot.sent')}</FormNotice>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
          <FormAlert>{failure}</FormAlert>
          <Field
            label={t('field.email')}
            type="email"
            autoComplete="email"
            error={errors.email ? t('validation.email') : undefined}
            {...form.register('email')}
          />
          <button type="submit" className="key mt-2 w-full" disabled={isSubmitting}>
            {t('forgot.submit')}
          </button>
        </form>
      )}
      <p className="mt-6">
        <Link href="/sign-in" className="font-medium underline underline-offset-4">
          {t('forgot.back')}
        </Link>
      </p>
    </AuthShell>
  );
}
