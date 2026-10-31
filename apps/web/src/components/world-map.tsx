'use client';

import { useT } from '@/lib/i18n';

// Must match the path in .comet in globals.css, which the comet follows.
const ROUTE =
  'M70 560 C 200 590 330 540 370 450 C 410 360 170 340 120 270 C 80 210 240 170 340 150';

/** The six worlds on one route. Each has its own silhouette, so it reads without a label. */
export function WorldMap() {
  const t = useT();

  return (
    <svg
      viewBox="0 0 460 660"
      role="img"
      aria-label={t('world.mapLabel')}
      className="h-full max-h-[34rem] w-full"
    >
      {STARS.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#fff" opacity="0.55" />
      ))}

      <path
        d={ROUTE}
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="1 14"
        opacity="0.8"
      />

      <g transform="translate(70 560)">
        <circle r="46" fill="var(--color-coral)" />
        <path d="M-26 22V-8h9v8h8v-8h10v8h8v-8h9v30z" fill="var(--color-ink)" />
        <path d="M-5 22V8a5 5 0 0 1 10 0v14z" fill="var(--color-coral)" />
      </g>

      <g transform="translate(250 540)">
        <circle r="50" fill="var(--color-mint)" />
        <path d="M-40 28-10-26 8 6l10-16 24 38z" fill="var(--color-ink)" />
        <path d="m-10-26 9 16-6 4-4-5-7 6-3-3z" fill="#fff" />
      </g>

      <g transform="translate(370 430)">
        <ellipse
          rx="66"
          ry="16"
          fill="none"
          stroke="var(--color-sun)"
          strokeWidth="7"
          transform="rotate(-18)"
        />
        <circle r="38" fill="var(--color-violet)" />
        <path
          d="M-62 20a66 16-18 0 0 124-40"
          fill="none"
          stroke="var(--color-sun)"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </g>

      <g transform="translate(190 340)">
        <circle r="46" fill="var(--color-sun)" />
        <path
          d="M-34 16c12-16 22-4 32-12s22-8 36 12c-20 12-48 14-68 0z"
          fill="var(--color-mint)"
          stroke="var(--color-ink)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M0-30v30" stroke="var(--color-ink)" strokeWidth="5" strokeLinecap="round" />
        <path d="M0-30 20-20 0-12z" fill="var(--color-coral)" />
      </g>

      <g transform="translate(110 235)">
        <circle r="48" fill="#fff" />
        <path d="M-34 24v-24h14v-20h16v14h12V-20h16v14h10v30z" fill="var(--color-coral)" />
        <path d="M-14-8h5v5h-5zM18-8h5v5h-5zM-28 8h5v5h-5zM2 8h5v5H2z" fill="var(--color-ink)" />
      </g>

      <g transform="translate(340 150)">
        <circle r="52" fill="var(--color-ink)" />
        <path
          d="M2 0c0-8 12-6 12 4 0 14-24 16-30 0-7-20 18-34 36-22 12 8 16 20 12 30"
          fill="none"
          stroke="var(--color-mint)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="2" cy="1" r="5" fill="var(--color-sun)" />
      </g>

      <g className="comet">
        <circle r="9" fill="var(--color-sun)" />
        <circle r="15" fill="var(--color-sun)" opacity="0.3" />
      </g>
    </svg>
  );
}

const STARS: [number, number, number][] = [
  [40, 60, 2.5],
  [120, 110, 2],
  [200, 40, 3],
  [410, 60, 2],
  [30, 380, 2.5],
  [430, 280, 2],
  [260, 230, 2],
  [420, 610, 2.5],
  [150, 640, 2],
];
