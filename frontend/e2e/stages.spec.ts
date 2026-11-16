import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { openActions } from './helpers';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

test('этапы: полоса на холсте, переименование, сворачивание и сохранение', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E stages ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();

    await openActions(page);
    await page.getByRole('menuitem', { name: 'Этапы…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Этапы схемы' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Добавить этап' }).click();
    await dialog.getByLabel('Название этапа 1').fill('Согласование');
    await dialog.getByRole('button', { name: 'Применить' }).click();

    const band = page.locator('.stage-band').first();
    await expect(band).toBeVisible();
    await expect(band.locator('.stage-band__name')).toHaveText('Согласование');
    await expect(task).toBeVisible();

    // Свёрнутый этап прячет задачу, но XML остаётся прежним.
    await band.getByRole('button', { name: 'Свернуть этап «Согласование»' }).click();
    await expect(page.locator('.stage-band').first()).toHaveAttribute('data-collapsed', 'true');
    await expect(task).toBeHidden();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/diagrams/${diagram.id}/bpmn`) &&
          response.request().method() === 'PUT' &&
          response.ok(),
      ),
      page.keyboard.press('ControlOrMeta+s'),
    ]);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('bs:stages');
    expect(xml).toContain('Согласование');

    // После перезагрузки этап и его свёрнутость на месте.
    await page.reload();
    await expect(page.locator('.stage-band').first()).toBeVisible();
    await expect(page.locator('.stage-band').first()).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeHidden();

    // Разворачивание возвращает элементы.
    await page
      .locator('.stage-band')
      .first()
      .getByRole('button', { name: 'Развернуть этап «Согласование»' })
      .click();
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
