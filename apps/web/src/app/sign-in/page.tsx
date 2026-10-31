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
import { FormAlert } from '@/components/form-alert';
import { api, ApiError, setCsrfToken } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { homeFor, SESSION_KEY } from '@/lib/session';

const adultSchema = z.object({
  email: z.email('validation.email'),
  password: z.string().min(1, 'validation.required'),
});

const mfaSchema = z.object({
  mfaCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'validation.verificationCode'),
});

type Credentials = z.infer<typeof adultSchema>;

function adultLogin(credentials: Credentials, mfaCode?: string) {
  return api<AuthResult>('/auth/login', 'POST', {
    ...credentials,
    mfaCode,
    transport: 'cookie',
    deviceLabel: 'Web browser',
  });
}

const childSchema = z.object({
  loginCode: z.string().trim().min(3, 'validation.required'),
  username: z.string().trim().min(3, 'validation.required'),
  passcode: z.string().min(6, 'validation.passcodeLength'),
});

function useFinishSignIn() {
  const client = useQueryClient();
  const router = useRouter();
  return (result: AuthResult) => {
    setCsrfToken(result.csrfToken);
    client.setQueryData(SESSION_KEY, result);
    router.replace(homeFor(result));
  };
}

/** Second step for accounts with an authenticator. The password stays in memory only. */
function MfaStep({ credentials, onBack }: { credentials: Credentials; onBack: () => void }) {
  const t = useT();
  const finish = useFinishSignIn();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(mfaSchema) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ mfaCode }) => {
    setFailure(undefined);
    try {
      finish(await adultLogin(credentials, mfaCode));
    } catch (error) {
      form.resetField('mfaCode');
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <>
      <h1 className="font-display text-3xl font-bold">{t('signIn.mfa.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('signIn.mfa.lead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        <FormAlert>{failure}</FormAlert>
        <Field
          label={t('field.verificationCode')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          error={errors.mfaCode ? t('validation.verificationCode') : undefined}
          {...form.register('mfaCode')}
        />
        <button type="submit" className="key mt-2 w-full" disabled={isSubmitting}>
          {t('signIn.mfa.submit')}
        </button>
      </form>
      <button type="button" onClick={onBack} className="key key-quiet mt-8 w-full">
        {t('signIn.mfa.back')}
      </button>
    </>
  );
}

function AdultForm({ onSwitch }: { onSwitch: () => void }) {
  const t = useT();
  const finish = useFinishSignIn();
  const [failure, setFailure] = useState<string>();
  const [needsCode, setNeedsCode] = useState<Credentials>();
  const form = useForm({ resolver: zodResolver(adultSchema) });
  const { errors, isSubmitting } = form.formState;
  const message = (key?: string) => (key ? t(key as Parameters<typeof t>[0]) : undefined);

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      finish(await adultLogin(values));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'MFA_REQUIRED') {
        setNeedsCode(values);
        return;
      }
      setFailure(t(errorKey(error)));
    }
  });

  if (needsCode) {
    return (
      <MfaStep
        credentials={needsCode}
        onBack={() => {
          setNeedsCode(undefined);
          form.reset();
        }}
      />
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl font-bold">{t('signIn.adult.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('signIn.adult.lead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        <FormAlert>{failure}</FormAlert>
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
          autoComplete="current-password"
          error={message(errors.password?.message)}
          {...form.register('password')}
        />
        <button type="submit" className="key mt-2 w-full" disabled={isSubmitting}>
          {t('signIn.adult.submit')}
        </button>
      </form>
      <p className="mt-6">
        <Link href="/forgot-password" className="font-medium underline underline-offset-4">
          {t('signIn.adult.forgot')}
        </Link>
      </p>
      <p className="mt-2">
        {t('signIn.adult.noAccount')}{' '}
        <Link href="/register" className="font-medium underline underline-offset-4">
          {t('signIn.adult.createAccount')}
        </Link>
      </p>
      <button type="button" onClick={onSwitch} className="key key-quiet mt-8 w-full">
        {t('signIn.adult.switchToChild')}
      </button>
    </>
  );
}

function ChildForm({ onSwitch }: { onSwitch: () => void }) {
  const t = useT();
  const finish = useFinishSignIn();
  const [failure, setFailure] = useState<string>();
  const form = useForm({ resolver: zodResolver(childSchema) });
  const { errors, isSubmitting } = form.formState;
  const message = (key?: string) => (key ? t(key as Parameters<typeof t>[0]) : undefined);

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      finish(
        await api<AuthResult>('/auth/child/login', 'POST', { ...values, transport: 'cookie' }),
      );
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <>
      <h1 className="font-display text-3xl font-bold">{t('signIn.child.title')}</h1>
      <p className="mt-2 text-ink-soft">{t('signIn.child.lead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
        <FormAlert>{failure}</FormAlert>
        <Field
          label={t('field.familyCode')}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          error={message(errors.loginCode?.message)}
          {...form.register('loginCode')}
        />
        <Field
          label={t('field.username')}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          error={message(errors.username?.message)}
          {...form.register('username')}
        />
        <Field
          label={t('field.passcode')}
          type="password"
          autoComplete="current-password"
          error={message(errors.passcode?.message)}
          {...form.register('passcode')}
        />
        <button type="submit" className="key mt-2 w-full" disabled={isSubmitting}>
          {t('signIn.child.submit')}
        </button>
      </form>
      <button type="button" onClick={onSwitch} className="key key-quiet mt-8 w-full">
        {t('signIn.child.switchToAdult')}
      </button>
    </>
  );
}

export default function SignInPage() {
  const [mode, setMode] = useState<'adult' | 'child'>('child');

  return (
    <AuthShell>
      {mode === 'child' ? (
        <ChildForm onSwitch={() => setMode('adult')} />
      ) : (
        <AdultForm onSwitch={() => setMode('child')} />
      )}
    </AuthShell>
  );
}
