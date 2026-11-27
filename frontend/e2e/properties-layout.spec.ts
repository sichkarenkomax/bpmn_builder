import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/** 1.5.19: порядок блоков свойств и размер панели запоминаются для пользователя. */

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';
const STORAGE_KEY = 'bpmn-studio.properties-layout.v1';

test('порядок блоков и ширина свойств переживают перезагрузку', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E properties ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY);

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

    // Перетаскивание: «Стиль» встаёт на место «Элемента».
    const styleGrip = page.getByRole('button', { name: 'Перетащить «Стиль»' });
    await styleGrip.dragTo(page.locator('[data-inspector-section="element"]'));
    await expect.poll(async () => (await sectionOrder())[0]).toBe('style');

    // Перезагрузка: раскладка пришла из localStorage.
    await page.reload();
    await selectTask();
    expect((await sectionOrder())[0]).toBe('style');

    // Ручка в правом нижнем углу: тянем влево, панель становится шире.
    const inspector = page.locator('.inspector');
    const before = await inspector.boundingBox();
    expect(before).not.toBeNull();
    const handle = page.getByRole('button', { name: 'Изменить размер панели свойств' });
    const handleBox = await handle.boundingBox();
    expect(handleBox).not.toBeNull();
    if (!before || !handleBox) {
      return;
    }
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 90, handleBox.y + 20, { steps: 5 });
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
