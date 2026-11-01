'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { MfaEnrollment, MfaRecoveryCodes, MfaStatus } from '@impulse/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AdultShell } from '@/components/adult-shell';
import { Field } from '@/components/field';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { QrCode } from '@/components/qr-code';
import { RecoveryCodes } from '@/components/recovery-codes';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { SESSION_KEY, useRequireSession } from '@/lib/session';

const MFA_KEY = ['mfa'] as const;

const totpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'validation.verificationCode'),
});

const disableSchema = z.object({
  password: z.string().min(1, 'validation.required'),
  code: z
    .string()
    .trim()
    .refine(
      (value) => /^\d{6}$/.test(value) || value.replace(/[^a-z0-9]/gi, '').length === 10,
      'validation.codeOrRecovery',
    ),
});

/** Groups of four are easier to copy by hand into an authenticator app. */
const grouped = (secret: string) => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

function Enrollment({
  enrollment,
  onDone,
}: {
  enrollment: MfaEnrollment;
  onDone: (codes: string[]) => void;
}) {
  const t = useT();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(totpSchema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    setFailure(undefined);
    try {
      const { recoveryCodes } = await api<MfaRecoveryCodes>('/auth/mfa/confirm', 'POST', { code });
      onDone(recoveryCodes);
    } catch (error) {
      form.resetField('code');
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <ol className="mt-8 flex list-decimal flex-col gap-8 pl-6 marker:font-display marker:font-bold">
      <li>
        <p className="max-w-prose">{t('security.step1')}</p>
        <p className="mt-1 max-w-prose text-ink-soft">{t('security.scanHint')}</p>
        <div className="mt-4">
          <QrCode value={enrollment.otpauthUri} label={t('security.qrAlt')} />
        </div>
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

function RegenerateCodes({ onIssued }: { onIssued: (codes: string[]) => void }) {
  const t = useT();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(totpSchema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    setFailure(undefined);
    try {
      const { recoveryCodes } = await api<MfaRecoveryCodes>('/auth/mfa/recovery-codes', 'POST', {
        code,
      });
      form.reset();
      onIssued(recoveryCodes);
    } catch (error) {
      form.resetField('code');
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">{t('security.regenTitle')}</h2>
      <p className="mt-2 max-w-prose text-ink-soft">{t('security.regenLead')}</p>
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
        <button type="submit" className="key key-quiet" disabled={isSubmitting}>
          {t('security.regenSubmit')}
        </button>
      </form>
    </section>
  );
}

function DisableMfa({ onDisabled }: { onDisabled: () => void }) {
  const t = useT();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(disableSchema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      await api('/auth/mfa/disable', 'POST', values);
      onDisabled();
    } catch (error) {
      form.resetField('code');
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold">{t('security.disableTitle')}</h2>
      <p className="mt-2 max-w-prose text-ink-soft">{t('security.disableLead')}</p>
      <form onSubmit={submit} noValidate className="mt-4 flex max-w-sm flex-col gap-5">
        <FormAlert>{failure}</FormAlert>
        <Field
          label={t('field.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password ? t('validation.required') : undefined}
          {...form.register('password')}
        />
        <Field
          label={t('field.codeOrRecovery')}
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.code ? t('validation.codeOrRecovery') : undefined}
          {...form.register('code')}
        />
        <button type="submit" className="key key-quiet" disabled={isSubmitting}>
          {t('security.disableSubmit')}
        </button>
      </form>
    </section>
  );
}

export default function SecurityPage() {
  const t = useT();
  const client = useQueryClient();
  const session = useRequireSession('ADULT');
  const status = useQuery({
    queryKey: MFA_KEY,
    queryFn: () => api<MfaStatus>('/auth/mfa'),
    enabled: session !== null,
  });
  const [enrollment, setEnrollment] = useState<MfaEnrollment>();
  const [issuedCodes, setIssuedCodes] = useState<string[]>();
  const [notice, setNotice] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [starting, setStarting] = useState(false);

  if (!session) {
    return null;
  }

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: MFA_KEY }),
      client.invalidateQueries({ queryKey: SESSION_KEY }),
    ]);

  const start = async () => {
    setFailure(undefined);
    setNotice(undefined);
    setStarting(true);
    try {
      setEnrollment(await api<MfaEnrollment>('/auth/mfa/enroll', 'POST'));
    } catch (error) {
      setFailure(t(errorKey(error)));
    } finally {
      setStarting(false);
    }
  };

  const showCodes = async (codes: string[]) => {
    setEnrollment(undefined);
    setIssuedCodes(codes);
    await refresh();
  };

  const enabled = status.data?.enabled ?? session.mfaEnabled;

  return (
    <AdultShell session={session}>
      <h1 className="font-display text-3xl font-bold">{t('security.title')}</h1>
      <p className="mt-2 max-w-prose text-ink-soft">{t('security.lead')}</p>

      <div className="mt-8 flex flex-col gap-4">
        <FormAlert>{failure}</FormAlert>
        {notice ? <FormNotice>{notice}</FormNotice> : null}
      </div>

      {issuedCodes ? (
        <RecoveryCodes
          codes={issuedCodes}
          onDone={() => {
            setIssuedCodes(undefined);
            setNotice(t('security.done'));
          }}
        />
      ) : enrollment ? (
        <Enrollment enrollment={enrollment} onDone={(codes) => void showCodes(codes)} />
      ) : enabled ? (
        <>
          <p className="mt-4">{t('security.enabled')}</p>
          {status.data ? (
            <p className="mt-1 text-ink-soft">
              {t('security.remaining', { count: status.data.recoveryCodesRemaining })}
            </p>
          ) : null}
          <RegenerateCodes onIssued={(codes) => void showCodes(codes)} />
          <DisableMfa
            onDisabled={() => {
              setNotice(undefined);
              void refresh();
            }}
          />
        </>
      ) : (
        <div className="mt-4">
          <p>{t('security.disabled')}</p>
          <button
            type="button"
            className="key mt-4"
            disabled={starting}
            onClick={() => void start()}
          >
            {t('security.start')}
          </button>
        </div>
      )}

      <p className="mt-12">
        <Link href="/dashboard" className="font-medium underline underline-offset-4">
          {t('common.back')}
        </Link>
      </p>
    </AdultShell>
  );
}
