import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

test('большое окно Markdown: предпросмотр, применение и сохранение', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E md window ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.click();

    await page.getByRole('button', { name: 'Окно' }).click();
    const dialog = page.getByRole('dialog', { name: 'Документация элемента' });
    await expect(dialog).toBeVisible();

    const textarea = dialog.getByLabel('Текст документации');
    await textarea.fill('## Регламент\n\n**Срок** — 2 дня, [инструкция](https://example.com)');
    await expect(dialog.locator('.docs-window__preview')).toContainText('Регламент');
    await expect(dialog.locator('.docs-window__preview strong')).toHaveText('Срок');
    await expect(dialog.locator('.docs-window__preview a')).toHaveAttribute(
      'href',
      'https://example.com',
    );

    await dialog.getByRole('button', { name: 'Применить' }).click();
    await expect(dialog).toHaveCount(0);

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
    expect(xml).toContain('Регламент');
    expect(xml).toContain('https://example.com');

    await page.reload();
    await expect(page.locator('[data-element-id="Task_Review"]')).toBeVisible();
    await page.locator('[data-element-id="Task_Review"]').first().click();
    await expect(page.locator('.docs-editor textarea')).toHaveValue(/Регламент/);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
