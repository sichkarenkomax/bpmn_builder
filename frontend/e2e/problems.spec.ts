import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/unreachable-task.bpmn'), 'utf8');
const API = '/api/v1';

test('ручной режим проверки: без автозапуска, по кнопке и после перезагрузки', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E validation manual ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };
  const validationRequests: string[] = [];
  page.on('request', (event) => {
    if (event.url().includes('/api/v1/') && event.url().includes('/validate')) {
      validationRequests.push(event.url());
    }
  });

  try {
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('bpmn-studio.validation-mode', 'manual');
      window.localStorage.setItem('bpmn-studio.autosave', '2');
    });
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Task_Unused"]').first()).toBeVisible();

    const status = page.locator('.validation-status');
    await expect(status).toContainText('Не проверялось');
    expect(validationRequests).toHaveLength(0);

    // Настройка читается обратно в диалоге и переживает перезагрузку.
    await page.getByRole('button', { name: 'Настройки схемы' }).click();
    const settings = page.getByRole('dialog', { name: 'Настройки схемы' });
    await settings.getByRole('tab', { name: 'Вид' }).click();
    await expect(settings.getByLabel('Когда проверять')).toHaveValue('manual');
    await settings.getByRole('button', { name: 'Готово' }).click();

    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/diagrams/${diagram.id}/validate`) && response.ok(),
      ),
      page.getByRole('button', { name: 'Проверить схему' }).click(),
    ]);
    await expect(status).toContainText('Актуально');
    expect(validationRequests).toHaveLength(1);

    // Правка и автосохранение не должны сами запускать проверку.
    const panel = page.getByRole('region', { name: 'Проблемы' });
    await panel.getByRole('button', { name: 'Закрыть' }).click();
    await page.locator('[data-element-id="Task_Unused"]').first().click();
    await page.locator('.djs-context-pad [data-action="delete"]').click();
    await expect(page.locator('[data-element-id="Task_Unused"]')).toHaveCount(0);
    await expect(status).toContainText('Не проверялось', { timeout: 20_000 });
    expect(validationRequests).toHaveLength(1);

    validationRequests.length = 0;
    await page.reload();
    await expect(status).toContainText('Не проверялось');
    expect(validationRequests).toHaveLength(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('DOCX-отчёт скачивается из панели проблем', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E validation report ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    // По умолчанию проверка теперь только по требованию: тесту нужен авторежим.
    await page.addInitScript(() =>
      window.localStorage.setItem('bpmn-studio.validation-mode', 'after-save'),
    );
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('.validation-status')).toContainText('Актуально', {
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /^Проблемы/ }).click();
    const panel = page.getByRole('region', { name: 'Проблемы' });
    const downloadPromise = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'DOCX' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('validation.docx');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('клик по маркеру предупреждения открывает проблемы и подсвечивает находку', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E validation pin ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    // По умолчанию проверка теперь только по требованию: тесту нужен авторежим.
    await page.addInitScript(() =>
      window.localStorage.setItem('bpmn-studio.validation-mode', 'after-save'),
    );
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Unused"]').first();
    await expect(task).toBeVisible();
    await expect(page.locator('.validation-status')).toContainText('Актуально', {
      timeout: 15_000,
    });

    // Панель проблем закрыта, пока на маркер не нажали.
    const panel = page.getByRole('region', { name: 'Проблемы' });
    await expect(panel).toHaveCount(0);

    const pin = page.locator('.validation-pin').first();
    await expect(pin).toBeVisible();
    await pin.click();

    await expect(panel).toBeVisible();
    await expect(panel.locator('.problem--highlighted')).toHaveCount(1);
    await expect(panel.locator('.problem--highlighted')).toContainText('Лишняя задача');
    await expect(task).toHaveClass(/selected/);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('ошибка валидации: панель, переход к элементу и повторная проверка', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E validation ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    // По умолчанию проверка теперь только по требованию: тесту нужен авторежим.
    await page.addInitScript(() =>
      window.localStorage.setItem('bpmn-studio.validation-mode', 'after-save'),
    );
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Unused"]').first();
    await expect(task).toBeVisible();

    const status = page.locator('.validation-status');
    await expect(status).toContainText('Актуально', { timeout: 15_000 });
    await expect(status).toHaveAttribute('aria-live', 'polite');

    await page.getByRole('button', { name: /^Проблемы/ }).click();
    const panel = page.getByRole('region', { name: 'Проблемы' });
    await expect(panel.locator('.problem')).toHaveCount(2);

    await panel.locator('.problem').first().click();
    await expect(task).toHaveClass(/selected/);
    await expect(page.locator('.inspector--open')).toBeVisible();

    // Панель перекрывает контекстную панель фигуры — закрываем её перед удалением.
    await panel.getByRole('button', { name: 'Закрыть' }).click();
    await expect(panel).toHaveCount(0);
    await page.locator('.djs-context-pad [data-action="delete"]').click();
    await expect(task).toHaveCount(0);

    // Автосохранение и проверка не должны блокироваться удалением.
    await expect(status).toContainText('Актуально', { timeout: 20_000 });
    await page.getByRole('button', { name: /^Проблемы/ }).click();
    const reopened = page.getByRole('region', { name: 'Проблемы' });
    await expect(reopened.getByText('Проблем не найдено.')).toBeVisible();
    await expect(reopened.locator('.problem')).toHaveCount(0);

    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/diagrams/${diagram.id}/validate`) && response.ok(),
      ),
      page.getByRole('button', { name: 'Проверить схему' }).click(),
    ]);

    await expect(reopened.getByText('Проблем не найдено.')).toBeVisible();
    await expect(reopened.locator('.problem')).toHaveCount(0);
    // Статус в панели инструментов — короткий; числа остаются в подсказке.
    await expect(status).toHaveText('Актуально');
    await expect(status).toHaveAttribute('title', /Ошибки: 0/);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
