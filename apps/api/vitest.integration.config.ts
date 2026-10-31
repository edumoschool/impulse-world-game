import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Integration tests run against real PostgreSQL and Redis, in the impulse_test database. */
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    setupFiles: ['test/support/test-env.ts'],
    // Files share one database, and the catalog and rate-limit suites assume exclusive use.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
