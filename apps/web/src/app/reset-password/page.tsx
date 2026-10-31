'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthShell } from '@/components/auth-shell';
import { Field } from '@/components/field';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';

const schema = z.object({ newPassword: z.string().min(12) });

function ResetForm() {
  const t = useT();
  const token = useSearchParams().get('token');
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      await api('/auth/password/reset', 'POST', { token, ...values });
      setDone(true);
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  if (!token) {
    return <FormAlert>{t('reset.missing')}</FormAlert>;
  }
  if (done) {
    return (
      <>
        <FormNotice>{t('reset.done')}</FormNotice>
        <p className="mt-6">
          <Link href="/sign-in" className="font-medium underline underline-offset-4">
            {t('forgot.back')}
          </Link>
        </p>
      </>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FormAlert>{failure}</FormAlert>
      <Field
        label={t('field.newPassword')}
        type="password"
        autoComplete="new-password"
        hint={t('field.passwordHint')}
        error={errors.newPassword ? t('validation.passwordLength') : undefined}
        {...form.register('newPassword')}
      />
      <button type="submit" className="key mt-2 w-full" disabled={isSubmitting}>
        {t('reset.submit')}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetHeading />
      <div className="mt-8">
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </AuthShell>
  );
}

function ResetHeading() {
  const t = useT();
  return <h1 className="font-display text-3xl font-bold">{t('reset.title')}</h1>;
}
