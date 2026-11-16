import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * 1.3.6: типы кастомных атрибутов — число/дата/ссылка валидируются,
 * тип пишется в bs:type и переживает сохранение и перезагрузку.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

test('тип атрибута сохраняется в bs:type и переживает перезагрузку', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E typed ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.click();

    await page.getByRole('button', { name: 'Добавить атрибут' }).click();
    await page.getByLabel('Имя атрибута').fill('sla');
    await page.getByLabel('Тип атрибута').selectOption('number');
    const value = page.getByLabel('Значение атрибута');

    // Число: неверный формат подсвечивается, верный — нет.
    await value.fill('4h');
    await expect(page.getByRole('alert')).toContainText('Число');
    await value.fill('42');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Дата: проверяется календарный день, а не только шаблон.
    await page.getByRole('button', { name: 'Добавить атрибут' }).click();
    const names = page.getByLabel('Имя атрибута');
    await names.nth(1).fill('срок');
    await page.getByLabel('Тип атрибута').nth(1).selectOption('date');
    const values = page.getByLabel('Значение атрибута');
    await values.nth(1).fill('2026-02-29');
    await expect(page.getByRole('alert')).toContainText('Дата');
    await values.nth(1).fill('2028-02-29');
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Строка не помечается типом в XML.
    await page.getByRole('button', { name: 'Добавить атрибут' }).click();
    await names.nth(2).fill('заметка');
    await values.nth(2).fill('просто текст');

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
    expect(savedXml).toContain('name="sla" value="42"');
    expect(savedXml).toMatch(/name="sla" value="42"[^>]*bs:type="number"/);
    expect(savedXml).toMatch(/name="срок" value="2028-02-29"[^>]*bs:type="date"/);
    expect(savedXml).not.toMatch(/name="заметка"[^>]*bs:type/);

    // После перезагрузки типы и значения на месте.
    await page.reload();
    await expect(page.locator('[data-element-id="Task_Review"]')).toBeVisible();
    await task.click();
    await expect(page.getByLabel('Имя атрибута').nth(0)).toHaveValue('sla');
    await expect(page.getByLabel('Тип атрибута').nth(0)).toHaveValue('number');
    await expect(page.getByLabel('Значение атрибута').nth(0)).toHaveValue('42');
    await expect(page.getByLabel('Тип атрибута').nth(1)).toHaveValue('date');
    await expect(page.getByLabel('Тип атрибута').nth(2)).toHaveValue('string');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
