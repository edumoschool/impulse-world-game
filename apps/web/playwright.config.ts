import { defineConfig, devices } from '@playwright/test';

/** Runs the production builds of the web app and API against the local development database. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: 'http://127.0.0.1:4000/api/v1/health/ready',
      reuseExistingServer: !process.env.CI,
      env: { RATE_LIMIT_MULTIPLIER: '100' },
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start -p 3000',
      url: 'http://localhost:3000/sign-in',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
