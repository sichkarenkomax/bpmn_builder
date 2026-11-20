import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

test('импорт BPMN создаёт диаграмму и открывает её в редакторе', async ({ page }) => {
  await page.goto('/');

  await page
    .getByLabel('Импортировать BPMN-файл')
    .setInputFiles(resolve(here, 'fixtures/simple.bpmn'));

  await expect(page).toHaveURL(/\/d\/[^/]+$/);
  await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();
});

test('импорт Bizagi сохраняет исходный XML и расширения', async ({ page }) => {
  await page.goto('/');

  await page
    .getByLabel('Импортировать BPMN-файл')
    .setInputFiles(resolve(here, '../../backend/tests/fixtures/bpmn/bizagi-approval.bpmn'));

  await expect(page).toHaveURL(/\/d\/[^/]+$/);
  await expect(page.locator('[data-element-id="Task_Approve"]').first()).toBeVisible();

  const diagramId = page.url().split('/').at(-1);
  const response = await page.request.get(`/api/v1/diagrams/${diagramId}/bpmn`);
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();
  expect(xml).toContain('bizagi:displayName');
  expect(xml).toContain('approved == true');
});
