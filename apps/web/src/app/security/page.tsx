'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { MfaEnrollment } from '@impulse/contracts';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AdultShell } from '@/components/adult-shell';
import { Field } from '@/components/field';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { SESSION_KEY, useRequireSession } from '@/lib/session';

const confirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'validation.verificationCode'),
});

/** Groups of four are easier to copy by hand into an authenticator app. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

function Enrollment({ enrollment, onDone }: { enrollment: MfaEnrollment; onDone: () => void }) {
  const t = useT();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(confirmSchema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    setFailure(undefined);
    try {
      await api('/auth/mfa/confirm', 'POST', { code });
      onDone();
    } catch (error) {
      form.resetField('code');
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <ol className="mt-8 flex list-decimal flex-col gap-8 pl-6 marker:font-display marker:font-bold">
      <li>
        <p className="max-w-prose">{t('security.step1')}</p>
        <a href={enrollment.otpauthUri} className="key key-quiet mt-4 inline-flex">
          {t('security.openApp')}
        </a>
        <p className="mt-4 text-sm text-ink-soft">{t('security.secretLabel')}</p>
        <p
          data-testid="mfa-secret"
          className="mt-1 font-mono text-lg font-semibold break-all select-all"
        >
          {grouped(enrollment.secret)}
        </p>
      </li>
      <li>
        <p className="max-w-prose">{t('security.step2')}</p>
        <form onSubmit={submit} noValidate className="mt-4 flex max-w-sm flex-col gap-5">
          <FormAlert>{failure}</FormAlert>
          <Field
            label={t('field.verificationCode')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            error={errors.code ? t('validation.verificationCode') : undefined}
            {...form.register('code')}
          />
          <button type="submit" className="key" disabled={isSubmitting}>
            {t('security.confirm')}
          </button>
        </form>
      </li>
    </ol>
  );
}

export default function SecurityPage() {
  const t = useT();
  const client = useQueryClient();
  const session = useRequireSession('ADULT');
  const [enrollment, setEnrollment] = useState<MfaEnrollment>();
  const [justEnabled, setJustEnabled] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [starting, setStarting] = useState(false);

  if (!session) {
    return null;
  }

  const start = async () => {
    setFailure(undefined);
    setStarting(true);
    try {
      setEnrollment(await api<MfaEnrollment>('/auth/mfa/enroll', 'POST'));
    } catch (error) {
      setFailure(t(errorKey(error)));
    } finally {
      setStarting(false);
    }
  };

  const finish = async () => {
    setEnrollment(undefined);
    setJustEnabled(true);
    await client.invalidateQueries({ queryKey: SESSION_KEY });
  };

  return (
    <AdultShell session={session}>
      <h1 className="font-display text-3xl font-bold">{t('security.title')}</h1>
      <p className="mt-2 max-w-prose text-ink-soft">{t('security.lead')}</p>

      <div className="mt-8">
        <FormAlert>{failure}</FormAlert>
        {justEnabled ? <FormNotice>{t('security.done')}</FormNotice> : null}
        {session.mfaEnabled && !justEnabled ? (
          <FormNotice>{t('security.enabled')}</FormNotice>
        ) : null}
        {!session.mfaEnabled && !justEnabled && !enrollment ? (
          <>
            <p>{t('security.disabled')}</p>
            <button
              type="button"
              className="key mt-4"
              disabled={starting}
              onClick={() => void start()}
            >
              {t('security.start')}
            </button>
          </>
        ) : null}
      </div>

      {enrollment ? <Enrollment enrollment={enrollment} onDone={() => void finish()} /> : null}

      <p className="mt-12">
        <Link href="/dashboard" className="font-medium underline underline-offset-4">
          {t('common.back')}
        </Link>
      </p>
    </AdultShell>
  );
}
