import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/pool.bpmn'), 'utf8').replace(
  'id="Definitions_Pool"',
  'id="Definitions_Pool" bs:theme="colored" xmlns:bs="https://bpmn-studio.dev/schema/1.0"',
);
const API = '/api/v1';

/**
 * Раньше Ctrl+V в коллаборации вставлял задачу в корень: в XML оставалась
 * только её геометрия, а bpmn-js уводил фигуру за пул. Теперь вставка идёт
 * в контейнер под курсором, сохраняется в процессе и остаётся над пулом.
 */
test('вставка в пул: элемент в процессе, над пулом и с цветом темы', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E paste ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    const pool = page.locator('[data-element-id="Pool_1"]').first();
    await expect(task).toBeVisible();
    await expect(pool).toBeVisible();

    const fillOf = (locator: typeof task) =>
      locator.evaluate(
        (element) => getComputedStyle(element.querySelector(':scope > .djs-visual > rect')!).fill,
      );
    const sourceFill = await fillOf(task);

    await task.click();
    await page.keyboard.press('Control+c');
    const poolBox = (await pool.boundingBox())!;
    await page.mouse.move(poolBox.x + poolBox.width - 40, poolBox.y + poolBox.height - 25);
    await page.keyboard.press('Control+v');

    const pasted = page.locator('[data-element-id^="Activity_"]').first();
    await expect(pasted).toBeVisible();
    expect(await fillOf(pasted)).toBe(sourceFill);

    // Группа вставленной фигуры лежит в контейнере пула, то есть после его фона.
    const insidePool = await pasted.evaluate(
      (element) =>
        element.closest('.djs-group')?.parentElement?.classList.contains('djs-children') ?? false,
    );
    expect(insidePool).toBe(true);

    const pastedId = (await pasted.getAttribute('data-element-id'))!;
    await expect
      .poll(async () => {
        const response = await request.get(`${API}/diagrams/${diagram.id}/bpmn`);
        return response.text();
      })
      .toContain(`bpmn:userTask id="${pastedId}"`);

    await page.reload();
    const restored = page.locator(`[data-element-id="${pastedId}"]`).first();
    await expect(restored).toBeVisible();
    expect(await fillOf(restored)).toBe(sourceFill);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
