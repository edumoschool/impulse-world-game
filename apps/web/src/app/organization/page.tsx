'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  TENANT_ASSIGNABLE_ROLES,
  type InvitationView,
  type MemberView,
  type OrganizationView,
  type SessionView,
} from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AdultShell } from '@/components/adult-shell';
import { Field } from '@/components/field';
import { FormAlert, FormNotice } from '@/components/form-alert';
import { SelectField } from '@/components/select-field';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useLocale, useT } from '@/lib/i18n';
import { useRequireSession } from '@/lib/session';

const UNITS_KEY = ['organization', 'units'] as const;
const MEMBERS_KEY = ['organization', 'members'] as const;
const INVITATIONS_KEY = ['organization', 'invitations'] as const;

const unitSchema = z.object({
  name: z.string().trim().min(2, 'validation.required').max(120),
  kind: z.enum(['BRANCH', 'DEPARTMENT']),
  parentId: z.uuid('validation.required'),
});

const inviteSchema = z.object({
  email: z.email('validation.email'),
  role: z.enum(TENANT_ASSIGNABLE_ROLES),
  organizationId: z.uuid('validation.required'),
});

const roleKey = (role: string) => `role.${role}` as MessageKey;
const kindKey = (kind: string) => `org.kind.${kind}` as MessageKey;

/** Parents come before their children, so the list reads as an indented tree. */
function asTree(units: OrganizationView[]): { unit: OrganizationView; depth: number }[] {
  const ordered: { unit: OrganizationView; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const unit of units.filter((entry) => entry.parentId === parentId)) {
      ordered.push({ unit, depth });
      visit(unit.id, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

function UnitOptions({ units }: { units: OrganizationView[] }) {
  return (
    <>
      {asTree(units).map(({ unit, depth }) => (
        <option key={unit.id} value={unit.id}>
          {`${'— '.repeat(depth)}${unit.name}`}
        </option>
      ))}
    </>
  );
}

function AddUnit({ units }: { units: OrganizationView[] }) {
  const t = useT();
  const client = useQueryClient();
  const [failure, setFailure] = useState<string>();
  const [added, setAdded] = useState<string>();
  const form = useForm({
    resolver: zodResolver(unitSchema),
    defaultValues: { kind: 'BRANCH' as const, parentId: units[0]?.id ?? '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    setAdded(undefined);
    try {
      const unit = await api<OrganizationView>('/organizations/units', 'POST', values);
      await client.invalidateQueries({ queryKey: UNITS_KEY });
      form.reset({ ...values, name: '' });
      setAdded(t('org.units.added', { name: unit.name }));
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="mt-6 flex max-w-md flex-col gap-5">
      <h3 className="font-display text-lg font-bold">{t('org.units.add')}</h3>
      <FormAlert>{failure}</FormAlert>
      {added ? <FormNotice>{added}</FormNotice> : null}
      <Field
        label={t('org.units.name')}
        autoComplete="off"
        error={errors.name ? t('validation.required') : undefined}
        {...form.register('name')}
      />
      <SelectField label={t('org.units.kind')} {...form.register('kind')}>
        <option value="BRANCH">{t('org.kind.BRANCH')}</option>
        <option value="DEPARTMENT">{t('org.kind.DEPARTMENT')}</option>
      </SelectField>
      <SelectField label={t('org.units.parent')} {...form.register('parentId')}>
        <UnitOptions units={units} />
      </SelectField>
      <button type="submit" className="key key-quiet" disabled={isSubmitting}>
        {t('org.units.submit')}
      </button>
    </form>
  );
}

function PendingInvitations() {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const [notice, setNotice] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const pending = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: () => api<InvitationView[]>('/organizations/invitations'),
  });
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));

  const cancel = async (invitation: InvitationView) => {
    setNotice(undefined);
    setFailure(undefined);
    try {
      await api(`/organizations/invitations/${invitation.id}`, 'DELETE');
      setNotice(t('org.invite.cancelled', { email: invitation.email }));
      await client.invalidateQueries({ queryKey: INVITATIONS_KEY });
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  };

  if (!pending.data?.length && !notice && !failure) {
    return null;
  }
  return (
    <div className="mt-8">
      <h3 className="font-display text-lg font-bold">{t('org.invite.pending')}</h3>
      <div className="mt-3 flex flex-col gap-3">
        <FormAlert>{failure}</FormAlert>
        {notice ? <FormNotice>{notice}</FormNotice> : null}
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {pending.data?.map((invitation) => (
          <li
            key={invitation.id}
            data-testid="pending-invitation"
            className="flex flex-wrap items-center justify-between gap-3 rounded-control border-2 border-ink/15 px-4 py-3"
          >
            <div>
              <p className="font-semibold break-all">{invitation.email}</p>
              <p className="text-sm text-ink-soft">
                {t(roleKey(invitation.role))} ·{' '}
                {t('org.invite.expires', { date: date(invitation.expiresAt) })}
              </p>
            </div>
            <button type="button" className="key key-quiet" onClick={() => void cancel(invitation)}>
              {t('org.invite.cancel')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InviteForm({ units }: { units: OrganizationView[] }) {
  const t = useT();
  const client = useQueryClient();
  const [failure, setFailure] = useState<string>();
  const [sent, setSent] = useState<string>();
  const form = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'TEACHER' as const, organizationId: units[0]?.id ?? '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFailure(undefined);
    setSent(undefined);
    try {
      const invitation = await api<InvitationView>('/organizations/invitations', 'POST', values);
      form.reset({ ...values, email: '' });
      setSent(t('org.invite.sent', { email: invitation.email }));
      await client.invalidateQueries({ queryKey: INVITATIONS_KEY });
    } catch (error) {
      setFailure(t(errorKey(error)));
    }
  });

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-bold">{t('org.invite.title')}</h2>
      <form onSubmit={submit} noValidate className="mt-4 flex max-w-md flex-col gap-5">
        <FormAlert>{failure}</FormAlert>
        {sent ? <FormNotice>{sent}</FormNotice> : null}
        <Field
          label={t('field.email')}
          type="email"
          autoComplete="off"
          error={errors.email ? t('validation.email') : undefined}
          {...form.register('email')}
        />
        <SelectField label={t('org.invite.role')} {...form.register('role')}>
          {TENANT_ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {t(roleKey(role))}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('org.invite.unit')} {...form.register('organizationId')}>
          <UnitOptions units={units} />
        </SelectField>
        <button type="submit" className="key" disabled={isSubmitting}>
          {t('org.invite.submit')}
        </button>
      </form>
      <PendingInvitations />
    </section>
  );
}

function Members({
  session,
  units,
  canManage,
}: {
  session: SessionView;
  units: OrganizationView[];
  canManage: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const members = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<MemberView[]>('/organizations/members'),
    enabled: canManage,
  });

  if (!canManage) {
    return null;
  }
  const unitName = (id: string) => units.find((unit) => unit.id === id)?.name ?? '';
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));

  const remove = async (member: MemberView) => {
    setFailure(undefined);
    setNotice(undefined);
    try {
      await api(`/organizations/members/${member.userId}`, 'DELETE');
      setConfirming(undefined);
      setNotice(t('org.members.removed', { name: member.displayName }));
      await client.invalidateQueries({ queryKey: MEMBERS_KEY });
    } catch (error) {
      setConfirming(undefined);
      setFailure(t(errorKey(error)));
    }
  };

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-bold">{t('org.members.title')}</h2>
      <div className="mt-4 flex flex-col gap-3">
        <FormAlert>{failure}</FormAlert>
        {notice ? <FormNotice>{notice}</FormNotice> : null}
        {members.isError ? <p role="alert">{t('org.loadFailed')}</p> : null}
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {members.data?.map((member) => {
          const isSelf = member.userId === session.user.id;
          return (
            <li
              key={`${member.userId}-${member.organizationId}`}
              data-testid="member"
              className="rounded-control border-2 border-ink/15 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {member.displayName}
                    {isSelf ? ` (${t('org.members.you')})` : ''}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {member.roles.map((role) => t(roleKey(role))).join(', ')} ·{' '}
                    {unitName(member.organizationId)}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {t('org.members.joined', { date: date(member.joinedAt) })}
                  </p>
                </div>
                {isSelf ? null : confirming === member.userId ? null : (
                  <button
                    type="button"
                    className="key key-quiet"
                    onClick={() => setConfirming(member.userId)}
                  >
                    {t('org.members.remove')}
                  </button>
                )}
              </div>
              {confirming === member.userId ? (
                <div className="mt-3 flex flex-col gap-3">
                  <p>{t('org.members.removeConfirm', { name: member.displayName })}</p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" className="key" onClick={() => void remove(member)}>
                      {t('org.members.removeAction')}
                    </button>
                    <button
                      type="button"
                      className="key key-quiet"
                      onClick={() => setConfirming(undefined)}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function OrganizationPage() {
  const t = useT();
  const session = useRequireSession('ADULT');
  const can = (permission: SessionView['permissions'][number]) =>
    session?.permissions.includes(permission) ?? false;
  const units = useQuery({
    queryKey: UNITS_KEY,
    queryFn: () => api<OrganizationView[]>('/organizations/units'),
    enabled: session !== null && can('organization.view'),
  });

  if (!session) {
    return null;
  }
  // Display only: the API enforces every one of these permissions again.
  const canStructure = can('organization.manage_structure');
  const canMembers = can('organization.manage_members');
  const tree = asTree(units.data ?? []);

  return (
    <AdultShell session={session}>
      <h1 className="font-display text-3xl font-bold">{t('org.title')}</h1>
      <p className="mt-2 max-w-prose text-ink-soft">{t('org.lead')}</p>

      {!can('organization.view') ? (
        <p role="alert" className="mt-8">
          {t('error.FORBIDDEN')}
        </p>
      ) : null}
      {units.isError ? (
        <p role="alert" className="mt-8">
          {t('org.loadFailed')}
        </p>
      ) : null}

      {units.data ? (
        <>
          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">{t('org.units.title')}</h2>
            <ul data-testid="units" className="mt-4 flex flex-col gap-2">
              {tree.map(({ unit, depth }) => (
                <li key={unit.id} style={{ paddingInlineStart: `${depth * 1.5}rem` }}>
                  <span className="font-semibold">{unit.name}</span>{' '}
                  <span className="text-sm text-ink-soft">{t(kindKey(unit.kind))}</span>
                </li>
              ))}
            </ul>
            {canStructure ? <AddUnit units={units.data} /> : null}
          </section>
          <Members session={session} units={units.data} canManage={canMembers} />
          {canMembers ? <InviteForm units={units.data} /> : null}
        </>
      ) : null}

      <p className="mt-12">
        <Link href="/dashboard" className="font-medium underline underline-offset-4">
          {t('common.back')}
        </Link>
      </p>
    </AdultShell>
  );
}
