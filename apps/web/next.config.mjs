const API_ORIGIN = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

/** @type {import('next').NextConfig} */
const config = {
  poweredByHeader: false,
  // Same-origin calls mean session cookies need no credentialed CORS (ADR-005).
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
