import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Unit tests: no database or network. SWC is needed for Nest's decorator metadata. */
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
    include: ['src/**/*.test.ts'],
  },
});
