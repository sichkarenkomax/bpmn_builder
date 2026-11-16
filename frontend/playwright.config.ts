import { defineConfig, devices } from '@playwright/test';

/**
 * E2E требует живой стек: backend с Postgres и Vite.
 * По умолчанию ждём фронтенд на 80 (как в docker compose);
 * другой адрес задаётся через E2E_BASE_URL.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
