import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

test('большое окно Markdown: предпросмотр, применение и сохранение', async ({ page, request }) => {
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
    await textarea.fill(
      '## Регламент\n\n**Срок** — 2 дня, [инструкция](https://example.com)\n\n' +
        '| Этап | Срок |\n| --- | ---: |\n| Проверка | 2 дня |\n\n' +
        '```ts\nconst days = 2;\n```\n\n> Важно\n\n- [x] готово\n\n![Схема](https://example.com/pic.png)',
    );
    const preview = dialog.locator('.docs-window__preview');
    await expect(preview).toContainText('Регламент');
    await expect(preview.locator('strong')).toHaveText('Срок');
    await expect(preview.locator('a')).toHaveAttribute('href', 'https://example.com');
    await expect(preview.locator('table th')).toHaveText(['Этап', 'Срок']);
    await expect(preview.locator('.md-code__keyword')).toHaveText('const');
    await expect(preview.locator('blockquote')).toContainText('Важно');
    await expect(preview.locator('input[type="checkbox"]')).toBeChecked();
    await expect(preview.locator('img.md-image')).toHaveAttribute(
      'src',
      'https://example.com/pic.png',
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
    expect(xml).toContain('https://example.com/pic.png');
    expect(xml).toContain('const days = 2');

    await page.reload();
    await expect(page.locator('[data-element-id="Task_Review"]')).toBeVisible();
    await page.locator('[data-element-id="Task_Review"]').first().click();
    await expect(page.locator('.docs-editor textarea')).toHaveValue(/Регламент/);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
