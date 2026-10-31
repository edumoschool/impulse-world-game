import type { Metadata, Viewport } from 'next';
import { Onest, Unbounded } from 'next/font/google';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

// Fonts are self-hosted at build time, so children's browsers never contact Google.
const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-unbounded',
  display: 'swap',
});
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-onest',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'IMPULSE WORLD',
  description: 'Learn. Play. Explore.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#2b2fd6' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${onest.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
