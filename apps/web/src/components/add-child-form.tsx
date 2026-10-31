'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { usernameSchema } from '@impulse/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { Field } from './field';
import { FormAlert } from './form-alert';

/** Bumped when the policy text changes, so consent records show which wording was agreed to. */
const POLICY_VERSION = '2026-10';

const currentYear = new Date().getFullYear();

const schema = z.object({
  displayName: z.string().trim().min(1, 'validation.required').max(40),
  username: z.string().pipe(usernameSchema),
  passcode: z.string().min(6, 'validation.passcodeLength').max(64),
  birthYear: z.coerce
    .number<string>()
    .int()
    .min(currentYear - 18, 'validation.birthYear')
    .max(currentYear - 3, 'validation.birthYear'),
  accountConsent: z.boolean().refine(Boolean, 'validation.consent'),
  analyticsConsent: z.boolean(),
});

export function AddChildForm({ onClose }: { onClose: () => void }) {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const [failure, setFailure] = useState<string>();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { accountConsent: false, analyticsConsent: false },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      await api('/children', 'POST', {
        displayName: values.displayName,
        username: values.username,
        passcode: values.passcode,
        birthYear: values.birthYear,
        locale,
        consent: {
          policyVersion: POLICY_VERSION,
          scopes: [
            'ACCOUNT_ACCESS',
            ...(values.analyticsConsent ? (['LEARNING_ANALYTICS'] as const) : []),
          ],
        },
      });
      await client.invalidateQueries({ queryKey: ['children'] });
      onClose();
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-5 rounded-sheet border-2 border-ink bg-sheet p-6"
    >
      <h2 className="font-display text-xl font-bold">{t('child.form.title')}</h2>
      <FormAlert>{failure}</FormAlert>
      <Field
        label={t('child.form.displayName')}
        hint={t('child.form.displayNameHint')}
        error={errors.displayName ? t('validation.required') : undefined}
        {...form.register('displayName')}
      />
      <Field
        label={t('child.form.username')}
        hint={t('child.form.usernameHint')}
        autoCapitalize="none"
        spellCheck={false}
        error={errors.username ? t('validation.username') : undefined}
        {...form.register('username')}
      />
      <Field
        label={t('child.form.passcode')}
        hint={t('child.form.passcodeHint')}
        type="password"
        autoComplete="new-password"
        error={errors.passcode ? t('validation.passcodeLength') : undefined}
        {...form.register('passcode')}
      />
      <Field
        label={t('child.form.birthYear')}
        hint={t('child.form.birthYearHint')}
        inputMode="numeric"
        error={errors.birthYear ? t('validation.birthYear') : undefined}
        {...form.register('birthYear')}
      />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 font-semibold">{t('child.form.consentHeading')}</legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-sky"
            {...form.register('accountConsent')}
          />
          <span>{t('child.form.consentAccount')}</span>
        </label>
        {errors.accountConsent ? (
          <p className="text-sm font-medium text-danger">{t('validation.consent')}</p>
        ) : null}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-sky"
            {...form.register('analyticsConsent')}
          />
          <span>{t('child.form.consentAnalytics')}</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="key" disabled={isSubmitting}>
          {t('child.form.submit')}
        </button>
        <button type="button" className="key key-quiet" onClick={onClose}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
