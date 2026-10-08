import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  outputDir: 'test-results/playwright',
  reporter: 'line',
  testDir: './tests/browser',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
  webServer: [
    {
      command:
        'pnpm --filter @votaciones/admin-web build && PORT=4301 API_ORIGIN=http://localhost:3000 node apps/admin-web/server.mjs',
      port: 4301,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        'pnpm --filter @votaciones/voter-web build && PORT=4302 API_ORIGIN=http://localhost:3000 node apps/voter-web/server.mjs',
      port: 4302,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
