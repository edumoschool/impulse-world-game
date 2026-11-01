'use client';

import { useId, useState } from 'react';
import { useT } from '@/lib/i18n';

/** Shown once, straight after the codes are issued. Nothing here is stored by the browser. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useT();
  const checkId = useId();
  const [saved, setSaved] = useState(false);

  const download = () => {
    const text = `${t('security.fileHeading')}\n\n${codes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'impulse-world-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mt-8 rounded-sheet border-2 border-ink p-6">
      <h2 className="font-display text-xl font-bold">{t('security.codesTitle')}</h2>
      <p className="mt-2 max-w-prose">{t('security.codesLead')}</p>
      <ul
        data-testid="recovery-codes"
        className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-lg font-semibold"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <button type="button" className="key key-quiet mt-6" onClick={download}>
        {t('security.download')}
      </button>
      <div className="mt-6 flex items-center gap-3">
        <input
          id={checkId}
          type="checkbox"
          className="size-6"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
        />
        <label htmlFor={checkId} className="font-medium">
          {t('security.savedCheck')}
        </label>
      </div>
      <button type="button" className="key mt-6" disabled={!saved} onClick={onDone}>
        {t('security.finish')}
      </button>
    </section>
  );
}
