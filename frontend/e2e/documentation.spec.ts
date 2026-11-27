import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * 1.3.12: документация элемента в Markdown — панель форматирования,
 * предпросмотр, сохранение в XML и переключатель в настройках.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

test('Markdown-панель документации: форматирование, предпросмотр, сохранение, переключатель', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E docs ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.click();

    // По умолчанию Markdown-панель включена: тулбар и текстовое поле на месте.
    const toolbar = page.locator('.docs-editor .md-toolbar');
    await expect(toolbar).toBeVisible();
    const docsTextarea = page.locator('.docs-editor textarea');
    await docsTextarea.fill('Проверить SLA до пятницы');

    // Выделение всего текста и «Ж» — обёртка в **жирный**.
    await docsTextarea.evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(0, textarea.value.length);
    });
    await page.getByRole('button', { name: 'Жирный (**текст**)' }).click();
    await expect(docsTextarea).toHaveValue('**Проверить SLA до пятницы**');

    // Повторное применение снимает обёртку.
    await docsTextarea.evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      textarea.setSelectionRange(2, 26);
    });
    await page.getByRole('button', { name: 'Жирный (**текст**)' }).click();
    await expect(docsTextarea).toHaveValue('Проверить SLA до пятницы');

    // Ссылка: выделенный текст превращается в [текст](url) с выделенным адресом.
    await docsTextarea.evaluate((node) => {
      const textarea = node as HTMLTextAreaElement;
      textarea.setSelectionRange(0, textarea.value.length);
    });
    await page.getByRole('button', { name: 'Ссылка [текст](url)' }).click();
    await expect(docsTextarea).toHaveValue('[Проверить SLA до пятницы](url)');

    // Предпросмотр: подставляем валидный адрес вместо плейсхолдера и проверяем рендер ссылки.
    await docsTextarea.fill('[Проверить SLA до пятницы](https://example.com/sla)');
    await page.getByRole('button', { name: 'Предпросмотр' }).click();
    const previewLink = page.locator('.md-doc a', { hasText: 'Проверить SLA до пятницы' });
    await expect(previewLink).toHaveAttribute('href', 'https://example.com/sla');
    await expect(page.getByRole('button', { name: 'Жирный (**текст**)' })).toBeDisabled();
    await page.getByRole('button', { name: 'Редактирование' }).click();
    await docsTextarea.fill('[Проверить SLA до пятницы](url)');

    // Сохранение: Markdown остаётся обычным текстом в bpmn:documentation.
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/diagrams/${diagram.id}/bpmn`) &&
          response.request().method() === 'PUT' &&
          response.ok(),
      ),
      page.keyboard.press('ControlOrMeta+s'),
    ]);
    const savedXml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(savedXml).toContain('[Проверить SLA до пятницы](url)');

    // После перезагрузки документация на месте.
    await page.reload();
    await expect(page.locator('[data-element-id="Task_Review"]')).toBeVisible();
    await task.click();
    await expect(page.locator('.docs-editor textarea')).toHaveValue(
      '[Проверить SLA до пятницы](url)',
    );

    // Переключатель в настройках: панель отключается и переживает перезагрузку.
    await page.getByRole('button', { name: 'Настройки схемы' }).click();
    const settings = page.getByRole('dialog', { name: 'Настройки схемы' });
    await expect(settings).toBeVisible();
    await settings.getByRole('tab', { name: 'Вид' }).click();
    await settings.getByLabel('Markdown-панель в документации элемента').uncheck();
    await settings.getByRole('button', { name: 'Готово' }).click();
    await expect(page.locator('.docs-editor .md-toolbar')).toHaveCount(0);
    const plainDocs = page.getByRole('textbox').filter({ hasText: /Проверить/ });
    await expect(plainDocs).toHaveCount(1);

    await page.reload();
    await expect(page.locator('[data-element-id="Task_Review"]')).toBeVisible();
    await task.click();
    await expect(page.locator('.docs-editor')).toHaveCount(0);
    await expect(page.getByRole('textbox').filter({ hasText: /Проверить/ })).toHaveCount(1);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
