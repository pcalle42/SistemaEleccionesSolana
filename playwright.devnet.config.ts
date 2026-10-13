import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 15_000 },
  fullyParallel: false,
  outputDir: 'test-results/playwright-devnet',
  reporter: 'line',
  testDir: './tests/browser-devnet',
  timeout: 180_000,
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
});
