import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/pool.bpmn'), 'utf8');
const API = '/api/v1';

test('этапы: вертикальная фаза внутри пула, веха, сворачивание и сохранение', async ({
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
    const pool = page.locator('[data-element-id="Pool_1"]').first();
    await expect(task).toBeVisible();
    await expect(pool).toBeVisible();

    await page.getByRole('button', { name: 'Этапы' }).click();
    const dialog = page.getByRole('dialog', { name: 'Этапы схемы' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Пул для нового этапа')).toHaveValue('Pool_1');
    await dialog.getByRole('button', { name: 'Добавить этап' }).click();
    await dialog.getByLabel('Название этапа 1').fill('Согласование');
    await expect(dialog.getByLabel('Пул этапа 1')).toHaveValue('Pool_1');
    await dialog.getByRole('button', { name: 'Добавить веху к этапу 1' }).click();
    await dialog.getByLabel('Название вехи 1 этапа 1').fill('Проверка');
    await dialog.getByRole('button', { name: 'Применить' }).click();

    const band = page.locator('.stage-band').first();
    await expect(band).toBeVisible();
    await expect(band).toHaveAttribute('data-pool-id', 'Pool_1');
    await expect(band.locator('.stage-band__name')).toHaveText('Согласование');
    await expect(band.locator('.stage-milestone__label')).toHaveText('Проверка');
    await expect(task).toBeVisible();

    // Этап не выходит за границы пула и занимает его высоту.
    const bandBox = await band.boundingBox();
    const poolBox = await pool.boundingBox();
    expect(bandBox).not.toBeNull();
    expect(poolBox).not.toBeNull();
    expect(bandBox!.x).toBeGreaterThanOrEqual(poolBox!.x - 1);
    expect(bandBox!.x + bandBox!.width).toBeLessThanOrEqual(poolBox!.x + poolBox!.width + 1);
    expect(bandBox!.y).toBeGreaterThanOrEqual(poolBox!.y - 1);
    expect(bandBox!.height).toBeLessThanOrEqual(poolBox!.height + 1);

    // Свёрнутый этап прячет задачи своей фазы, но XML остаётся прежним.
    await band.getByRole('button', { name: 'Свернуть этап «Согласование»' }).click();
    await expect(page.locator('.stage-band').first()).toHaveAttribute('data-collapsed', 'true');
    await expect(task).toBeHidden();
    await expect(band.locator('.stage-milestone')).toHaveCount(0);
    await expect(pool).toBeVisible();

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
    expect(xml).toContain('Pool_1');
    expect(xml).toContain('Согласование');
    expect(xml).toContain('Проверка');

    // После перезагрузки этап и его свёрнутость на месте.
    await page.reload();
    await expect(page.locator('.stage-band').first()).toBeVisible();
    await expect(page.locator('.stage-band').first()).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeHidden();
    await expect(page.locator('.stage-milestone')).toHaveCount(0);

    // Разворачивание возвращает элементы.
    await page
      .locator('.stage-band')
      .first()
      .getByRole('button', { name: 'Развернуть этап «Согласование»' })
      .click();
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();
    await expect(page.locator('.stage-milestone__label')).toHaveText('Проверка');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
