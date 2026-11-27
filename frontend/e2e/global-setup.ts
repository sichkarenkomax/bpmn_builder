import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { request } from '@playwright/test';

/**
 * 4.1: все E2E работают от одной тестовой учётной записи. Логинимся через API,
 * сохраняем cookie в storageState — страницы и `request` фикстура используют его.
 */
const statePath = fileURLToPath(new URL('./.auth/state.json', import.meta.url));

export default async function globalSetup(): Promise<void> {
  const base = (process.env['E2E_BASE_URL'] ?? 'http://127.0.0.1').replace(/\/$/, '');
  const api = process.env['E2E_API_URL'] ?? `${base}/api/v1`;
  const email = process.env['E2E_EMAIL'] ?? 'e2e@bpmn.local';
  const password = process.env['E2E_PASSWORD'] ?? 'e2e-password-123';

  await mkdir(dirname(statePath), { recursive: true });
  const context = await request.newContext();
  try {
    let response = await context.post(`${api}/auth/register`, {
      data: { email, name: 'E2E', password },
    });
    if (response.status() === 409) {
      response = await context.post(`${api}/auth/login`, { data: { email, password } });
    }
    if (!response.ok()) {
      throw new Error(
        `E2E auth failed: ${response.status()} ${await response.text()} (${api}/auth)`,
      );
    }
    await context.storageState({ path: statePath });
  } finally {
    await context.dispose();
  }
}
