'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { INSTITUTION_KINDS } from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AdultShell } from '@/components/adult-shell';
import { Field } from '@/components/field';
import { FormAlert } from '@/components/form-alert';
import { SelectField } from '@/components/select-field';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { useRequireSession, useSwitchTenant } from '@/lib/session';

const schema = z.object({
  name: z.string().trim().min(2, 'validation.required').max(120),
  kind: z.enum(INSTITUTION_KINDS),
});

export default function NewOrganizationPage() {
  const t = useT();
  const router = useRouter();
  const session = useRequireSession('ADULT');
  const switchTenant = useSwitchTenant();
  const [failure, setFailure] = useState<string>();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { kind: 'PRIVATE_SCHOOL' as const },
  });
  const { errors, isSubmitting } = form.formState;

  if (!session) {
    return null;
  }

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    try {
      const { tenantId } = await api<{ tenantId: string }>('/organizations', 'POST', values);
      await switchTenant(tenantId);
      router.replace('/organization');
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <AdultShell session={session}>
      <h1 className="font-display text-3xl font-bold">{t('org.create.title')}</h1>
      <p className="mt-2 max-w-prose text-ink-soft">{t('org.create.lead')}</p>
      <form onSubmit={submit} noValidate className="mt-8 flex max-w-md flex-col gap-5">
        <FormAlert>{failure}</FormAlert>
        <Field
          label={t('org.create.name')}
          autoComplete="organization"
          error={errors.name ? t('validation.required') : undefined}
          {...form.register('name')}
        />
        <SelectField label={t('org.create.kind')} {...form.register('kind')}>
          {INSTITUTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`institution.${kind}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <button type="submit" className="key" disabled={isSubmitting}>
          {t('org.create.submit')}
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
