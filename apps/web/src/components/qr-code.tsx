'use client';

import { toString as renderQr } from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * Drawn in the browser. The value holds the MFA secret, so it must never go to an image service.
 * Rendered through an <img> data URL rather than injected markup.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const [source, setSource] = useState<string>();

  useEffect(() => {
    let active = true;
    renderQr(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (active) {
          setSource(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        }
      })
      .catch(() => setSource(undefined));
    return () => {
      active = false;
    };
  }, [value]);

  if (!source) {
    return <div className="size-48 rounded-control bg-ink/5" aria-hidden />;
  }
  return (
    <img
      src={source}
      alt={label}
      width={192}
      height={192}
      className="size-48 rounded-control bg-white p-2"
    />
  );
}
