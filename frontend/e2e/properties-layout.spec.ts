import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/** 1.5.19: порядок блоков свойств и ширина панели запоминаются для пользователя. */

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';
const STORAGE_KEY = 'bpmn-studio.properties-layout.v1';

test('глобальный порядок блоков и полей применяется в панели', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E settings ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Сбросить раскладку' }).click();

    const sectionsList = page.getByRole('list', { name: 'Порядок блоков свойств' });
    const fieldsList = page.getByRole('list', { name: 'Порядок полей элемента' });
    await expect(sectionsList.locator('.layout-order__label').first()).toHaveText('Элемент');

    // «Стиль» — на первое место блоков, «Документация» — на первое место полей.
    await page.getByRole('button', { name: 'Выше: Стиль' }).click();
    await page.getByRole('button', { name: 'Выше: Стиль' }).click();
    await page.getByRole('button', { name: 'Выше: Документация' }).click();
    await page.getByRole('button', { name: 'Выше: Документация' }).click();
    await page.getByRole('button', { name: 'Выше: Документация' }).click();
    await expect(sectionsList.locator('.layout-order__label').first()).toHaveText('Стиль');
    await expect(fieldsList.locator('.layout-order__label').first()).toHaveText('Документация');

    // Настройки общие: порядок переживает перезагрузку и виден в редакторе.
    await page.reload();
    await expect(
      page
        .getByRole('list', { name: 'Порядок блоков свойств' })
        .locator('.layout-order__label')
        .first(),
    ).toHaveText('Стиль');

    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.click();
    await expect(page.locator('[data-inspector-section]').first()).toHaveAttribute(
      'data-inspector-section',
      'style',
    );
    await expect(page.locator('[data-inspector-field]').first()).toHaveAttribute(
      'data-inspector-field',
      'documentation',
    );
  } finally {
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('порядок блоков, сворачивание и ширина свойств переживают перезагрузку', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E properties ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
    await page.reload();

    const selectTask = async () => {
      const task = page.locator('[data-element-id="Task_Review"]').first();
      await expect(task).toBeVisible();
      await task.click();
    };
    const sectionOrder = () =>
      page
        .locator('[data-inspector-section]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-inspector-section')));

    await selectTask();
    expect(await sectionOrder()).toEqual([
      'element',
      'style',
      'attributes',
      'assignee',
      'behavior',
    ]);

    // Без режима раскладки ручек переноса нет — обычный просмотр не «ломается».
    await expect(page.getByRole('button', { name: 'Перетащить «Стиль»' })).toHaveCount(0);

    // Явный режим раскладки включает перенос.
    await page.getByRole('button', { name: /Раскладка/ }).click();
    await expect(page.getByRole('button', { name: 'Перетащить «Стиль»' })).toBeVisible();

    // «Стиль» встаёт перед «Элементом»: верхняя половина цели — вставка до.
    const styleGrip = page.getByRole('button', { name: 'Перетащить «Стиль»' });
    await styleGrip.dragTo(page.locator('[data-inspector-section="element"]'), {
      targetPosition: { x: 40, y: 4 },
    });
    await expect.poll(async () => (await sectionOrder())[0]).toBe('style');

    // Сворачивание: содержимое блока скрыто, заголовок остаётся.
    await page.getByRole('button', { name: 'Свернуть «Стиль»' }).click();
    await expect(page.getByRole('button', { name: 'Развернуть «Стиль»' })).toBeVisible();
    await expect(
      page.locator('.inspector').getByRole('button', { name: 'Сбросить стиль' }),
    ).toHaveCount(0);

    // Перезагрузка: порядок и свёрнутость пришли из localStorage.
    await page.reload();
    await selectTask();
    expect((await sectionOrder())[0]).toBe('style');
    await expect(page.getByRole('button', { name: 'Развернуть «Стиль»' })).toBeVisible();

    // Левая граница панели: тянем влево, панель становится шире.
    const inspector = page.locator('.inspector');
    const before = await inspector.boundingBox();
    expect(before).not.toBeNull();
    const handle = page.getByRole('button', { name: 'Изменить ширину панели свойств' });
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!before || !handleBox) {
      return;
    }
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 90, handleBox.y + handleBox.height / 2, { steps: 5 });
    await page.mouse.up();

    const after = await inspector.boundingBox();
    expect(after?.width).toBeGreaterThan(before.width + 40);

    await page.reload();
    await selectTask();
    const restored = await inspector.boundingBox();
    expect(restored?.width).toBeGreaterThan(before.width + 40);
  } finally {
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);
  }
});
