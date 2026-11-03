'use client';

import type { ContentAction, ContentState, SessionView } from '@impulse/contracts';
import type { MessageKey } from '@impulse/localization';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { FormAlert } from '@/components/form-alert';
import { api } from '@/lib/api';
import { errorKey } from '@/lib/form-errors';
import { useT } from '@/lib/i18n';
import { can, KINDS, type Kind } from '@/lib/studio';

export interface VersionSummary {
  id: string;
  number: number;
  state: ContentState;
  authorId: string;
  reviewNote: string | null;
}

const STATE_STYLE: Record<ContentState, string> = {
  DRAFT: 'bg-line text-ink',
  IN_REVIEW: 'bg-sun text-ink',
  APPROVED: 'bg-violet text-white',
  PUBLISHED: 'bg-mint text-ink',
  ARCHIVED: 'bg-paper text-ink-soft border border-line',
};

export function StateBadge({ state }: { state: ContentState }) {
  const t = useT();
  return (
    <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATE_STYLE[state]}`}>
      {t(`studio.state.${state}` as MessageKey)}
    </span>
  );
}

/**
 * The actions this person may take on a version. Display only: the API applies the same
 * lifecycle rules, including that an author never approves or publishes their own work.
 */
function actionsFor(session: SessionView, version: VersionSummary): ContentAction[] {
  const mine = version.authorId === session.user.id;
  switch (version.state) {
    case 'DRAFT':
      return mine && can(session, 'content.submit_for_review') ? ['submit'] : [];
    case 'IN_REVIEW':
      return !mine && can(session, 'content.review') ? ['approve', 'reject'] : [];
    case 'APPROVED':
      return [
        ...(!mine && can(session, 'content.publish') ? (['publish'] as const) : []),
        ...(!mine && can(session, 'content.review') ? (['reject'] as const) : []),
      ];
    case 'PUBLISHED':
      return can(session, 'content.publish') ? ['archive'] : [];
    case 'ARCHIVED':
      return [];
  }
}

export function VersionPanel({
  kind,
  session,
  versions,
  onChanged,
}: {
  kind: Kind;
  session: SessionView;
  versions: VersionSummary[];
  onChanged: () => void;
}) {
  const t = useT();
  return (
    <section aria-labelledby="versions-heading" className="mt-10">
      <h2 id="versions-heading" className="font-display text-xl font-bold">
        {t('studio.versions')}
      </h2>
      <ol className="mt-3 flex flex-col gap-3">
        {versions.map((version) => (
          <li key={version.id} data-testid="version" className="rounded-control bg-sheet p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">
                {t('studio.versionNumber', { number: version.number })} ·{' '}
                {version.authorId === session.user.id ? t('studio.byYou') : t('studio.byColleague')}
              </span>
              <StateBadge state={version.state} />
            </div>
            {version.reviewNote ? (
              <p className="mt-2 rounded-control bg-paper p-3">
                {t('studio.reviewNote')}: {version.reviewNote}
              </p>
            ) : null}
            <Actions
              kind={kind}
              version={version}
              actions={actionsFor(session, version)}
              onChanged={onChanged}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Actions({
  kind,
  version,
  actions,
  onChanged,
}: {
  kind: Kind;
  version: VersionSummary;
  actions: ContentAction[];
  onChanged: () => void;
}) {
  const t = useT();
  const reasonId = useId();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const step = useMutation({
    mutationFn: (body: { action: ContentAction; reason?: string }) =>
      api(`/${KINDS[kind].versions}/${version.id}/transitions`, 'POST', body),
    onSuccess: () => {
      setRejecting(false);
      setReason('');
      onChanged();
    },
  });
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {actions
          .filter((action) => action !== 'reject')
          .map((action) => (
            <button
              key={action}
              type="button"
              className={action === 'archive' ? 'key key-quiet' : 'key'}
              disabled={step.isPending}
              onClick={() => step.mutate({ action })}
            >
              {t(`studio.action.${action}` as MessageKey)}
            </button>
          ))}
        {actions.includes('reject') && !rejecting ? (
          <button type="button" className="key key-quiet" onClick={() => setRejecting(true)}>
            {t('studio.action.reject')}
          </button>
        ) : null}
      </div>
      {rejecting ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            step.mutate({ action: 'reject', reason });
          }}
        >
          <label htmlFor={reasonId} className="font-semibold">
            {t('studio.rejectReason')}
          </label>
          <textarea
            id={reasonId}
            required
            rows={2}
            maxLength={1000}
            className="rounded-control border-2 border-ink bg-sheet p-3"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className="key" disabled={step.isPending || !reason.trim()}>
              {t('studio.action.sendBack')}
            </button>
            <button type="button" className="key key-quiet" onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      ) : null}
      {step.isError ? <FormAlert>{t(errorKey(step.error))}</FormAlert> : null}
    </div>
  );
}
