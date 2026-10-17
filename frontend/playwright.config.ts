import { defineConfig, devices } from '@playwright/test';

/**
 * E2E specs run against the Docker stack on a local throwaway DB (`make e2e-up`), never against Neon.
 * The `.e2e.ts` suffix keeps them out of Vitest, which picks up every `*.spec.ts` / `*.test.ts`.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // The specs share one seeded DB and some of them write to it (publish, discard, roles).
  fullyParallel: false,
  workers: 1,
  // The dev server compiles each route on first visit.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, dependencies: ['setup'] },
  ],
});
