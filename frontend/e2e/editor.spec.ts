import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * Ключевой сценарий редактора (перенесён из ручных прогонов в /tmp):
 * чёрные стрелки, толстая граница завершающего события, своя тема,
 * комментарий к элементу и сохранение всего этого после перезагрузки.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

test('тема, комментарии и сохранение переживают перезагрузку', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();

    // 1.3.3: стрелки чёрные, у завершающего события толстая граница.
    const flowStroke = await page
      .locator('[data-element-id="Flow_1"] .djs-visual path')
      .first()
      .evaluate((node) => getComputedStyle(node).stroke);
    expect(flowStroke).toBe('rgb(0, 0, 0)');
    const endStroke = await page
      .locator('[data-element-id="EndEvent_1"] .djs-visual circle')
      .first()
      .evaluate((node) => getComputedStyle(node).strokeWidth);
    expect(endStroke).toBe('4px');

    // 1.3.11: своя тема — цвета по категориям и тёмный фон холста.
    await page.getByRole('button', { name: 'Тема', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Тема оформления' });
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="diagram-theme"][value="custom"]').check();

    const taskFill = dialog.getByLabel('Заливка: Задачи');
    await taskFill.evaluate((node) => {
      const input = node as HTMLInputElement;
      // Нативный setter обходит value-трекер React: иначе onChange не увидит правку.
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, '#cc0000');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect
      .poll(() =>
        page
          .locator('[data-element-id="Task_Review"] .djs-visual rect')
          .first()
          .evaluate((node) => getComputedStyle(node).fill),
      )
      .toBe('rgb(204, 0, 0)');

    await dialog.getByLabel('Тёмный фон холста (для презентаций и тёмных тем)').check();
    await expect(page.locator('[data-testid="diagram-editor"]')).toHaveAttribute(
      'data-canvas',
      'dark',
    );
    await dialog.getByRole('button', { name: 'Готово' }).click();

    // Сохранение: ждём именно PUT, бейдж «сохранено» остаётся от прошлой записи.
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/diagrams/${diagram.id}/bpmn`) &&
          response.request().method() === 'PUT' &&
          response.ok(),
      ),
      page.keyboard.press('ControlOrMeta+s'),
    ]);

    // 1.3.8: комментарий к выбранному элементу и маркер на холсте.
    await task.click();
    await page.getByRole('button', { name: /^Комментарии/ }).click();
    const panel = page.getByRole('region', { name: 'Комментарии' });
    await panel.getByLabel('Новый комментарий').fill('Проверить SLA до пятницы');
    await panel.getByRole('button', { name: 'Отправить' }).click();
    await expect(panel.getByText('Проверить SLA до пятницы')).toBeVisible();
    await expect(page.locator('.comment-pin')).toHaveText('1');

    await page.reload();
    await expect(page.locator('[data-element-id="Task_Review"]')).toBeVisible();

    // После перезагрузки: тема, свой цвет, фон и комментарий на месте.
    await expect
      .poll(() =>
        page
          .locator('[data-element-id="Task_Review"] .djs-visual rect')
          .first()
          .evaluate((node) => getComputedStyle(node).fill),
      )
      .toBe('rgb(204, 0, 0)');
    await expect(page.locator('[data-testid="diagram-editor"]')).toHaveAttribute(
      'data-canvas',
      'dark',
    );
    await expect(page.locator('.comment-pin')).toHaveText('1');

    const savedXml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(savedXml).toContain('bs:custom-theme');
    expect(savedXml).toContain('bs:theme="custom"');
    expect(savedXml).toContain('bs:canvas="dark"');

    // Resolve убирает маркер, но сообщение остаётся в ветке.
    await page.locator('.comment-pin').click();
    const reopened = page.getByRole('region', { name: 'Комментарии' });
    await expect(reopened.getByText('Проверить SLA до пятницы')).toBeVisible();
    await reopened.getByRole('button', { name: 'Решить' }).click();
    await expect(page.locator('.comment-pin')).toHaveCount(0);
    await expect(reopened.getByText('решено')).toBeVisible();
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
