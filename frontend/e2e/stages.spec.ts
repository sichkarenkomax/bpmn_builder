import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/pool.bpmn'), 'utf8');
const API = '/api/v1';

test('этапы: параметр пула, добавление через «+» и ПКМ, граница и сохранение', async ({
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

    // Этапы включаются параметром пула в инспекторе. Кликаем по полосе
    // названия пула, чтобы не попасть в задачу на холсте.
    await pool.click({ position: { x: 10, y: 30 } });
    await page.getByRole('button', { name: 'Свойства', exact: true }).click();
    const stagesCheckbox = page.getByRole('checkbox', { name: /^Этапы/ });
    await expect(stagesCheckbox).not.toBeChecked();
    await stagesCheckbox.check();

    const bands = page.locator('.stage-band');
    await expect(bands).toHaveCount(1);
    const firstBand = bands.first();
    await expect(firstBand.locator('.stage-band__name')).toHaveText('Этап 1');

    // Первый этап — основная часть пула, а не его полоса с названием.
    const poolBox = await pool.boundingBox();
    const firstBandBox = await firstBand.boundingBox();
    expect(poolBox).not.toBeNull();
    expect(firstBandBox).not.toBeNull();
    expect(firstBandBox!.x).toBeGreaterThan(poolBox!.x + 20);
    expect(firstBandBox!.x + firstBandBox!.width).toBeLessThanOrEqual(
      poolBox!.x + poolBox!.width + 1,
    );

    // Название этапа меняется двойным щелчком.
    await firstBand.locator('.stage-band__name').dblclick();
    const nameInput = page.getByLabel('Название этапа «Этап 1»');
    await nameInput.fill('Согласование');
    await nameInput.press('Enter');
    await expect(firstBand.locator('.stage-band__name')).toHaveText('Согласование');

    // «+» у правой границы последнего этапа добавляет следующий.
    await firstBand.locator('.stage-band__add').click();
    await expect(bands).toHaveCount(2);
    await expect(bands.nth(1).locator('.stage-band__name')).toHaveText('Этап 2');

    // Пул расширился, поэтому вторая фаза помещается справа.
    const widenedPoolBox = await pool.boundingBox();
    expect(widenedPoolBox).not.toBeNull();
    expect(widenedPoolBox!.width).toBeGreaterThan(poolBox!.width + 100);

    // ПКМ по пулу добавляет ещё один этап.
    await pool.click({ button: 'right', position: { x: 10, y: 30 } });
    await page.getByRole('menuitem', { name: 'Добавить этап' }).click();
    await expect(bands).toHaveCount(3);
    await expect(bands.nth(2).locator('.stage-band__name')).toHaveText('Этап 3');

    // Последняя граница — рамка пула; изгиб «>» есть у каждой линии.
    await expect(page.locator('.stage-band__line')).toHaveCount(3);
    await expect(bands.nth(2)).toHaveClass(/stage-band--last/);
    await expect(bands.nth(2).locator('.stage-band__line')).toHaveClass(/stage-band__line--pool/);

    // Граница первого этапа тянется мышью: этап и пул расширяются,
    // а следующие этапы сдвигаются вправо.
    const firstResizer = firstBand.locator('.stage-band__resizer');
    const firstResizerBox = await firstResizer.boundingBox();
    const secondBandLeftBefore = (await bands.nth(1).boundingBox())!.x;
    expect(firstResizerBox).not.toBeNull();
    await page.mouse.move(firstResizerBox!.x + firstResizerBox!.width / 2, firstResizerBox!.y + 80);
    await page.mouse.down();
    await page.mouse.move(
      firstResizerBox!.x + firstResizerBox!.width / 2 + 60,
      firstResizerBox!.y + 80,
      { steps: 6 },
    );
    await page.mouse.up();
    const resizedFirstBox = (await firstBand.boundingBox())!;
    expect(resizedFirstBox.width).toBeGreaterThan(firstBandBox!.width + 40);
    const secondBandLeftAfter = (await bands.nth(1).boundingBox())!.x;
    expect(secondBandLeftAfter).toBeGreaterThan(secondBandLeftBefore + 40);

    // Правый край пула тоже тянется, но пул не сжимается меньше
    // последнего этапа.
    const lastResizer = bands.nth(2).locator('.stage-band__resizer');
    const lastResizerBox = (await lastResizer.boundingBox())!;
    await page.mouse.move(lastResizerBox.x + lastResizerBox.width / 2, lastResizerBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(
      lastResizerBox.x + lastResizerBox.width / 2 - 500,
      lastResizerBox.y + 80,
      { steps: 8 },
    );
    await page.mouse.up();
    const lastBandBox = (await bands.nth(2).boundingBox())!;
    expect(lastBandBox.width).toBeGreaterThanOrEqual(98);

    // Свёрнутый первый этап прячет свои фигуры, но XML остаётся прежним.
    await firstBand.getByRole('button', { name: 'Свернуть этап «Согласование»' }).click();
    await expect(firstBand).toHaveAttribute('data-collapsed', 'true');
    await expect(task).toBeHidden();
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
    expect(xml).not.toContain('milestones');

    // После перезагрузки этапы и свёрнутость на месте.
    await page.reload();
    await expect(page.locator('.stage-band')).toHaveCount(3);
    await expect(page.locator('.stage-band').first()).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeHidden();

    await page
      .locator('.stage-band')
      .first()
      .getByRole('button', { name: 'Развернуть этап «Согласование»' })
      .click();
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('документация этапа: Markdown из кнопки и ПКМ, сохранение и просмотр (1.5.7)', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E stage docs ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const pool = page.locator('[data-element-id="Pool_1"]').first();
    await expect(pool).toBeVisible();
    await pool.click({ position: { x: 10, y: 30 } });
    await page.getByRole('button', { name: 'Свойства', exact: true }).click();
    await page.getByRole('checkbox', { name: /^Этапы/ }).check();

    const band = page.locator('.stage-band').first();
    await expect(band).toBeVisible();

    // ПКМ по названию этапа открывает меню с документацией.
    await band.locator('.stage-band__name').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Документация этапа…' }).click();
    const dialog = page.getByRole('dialog', { name: /Документация этапа/ });
    await expect(dialog).toBeVisible();
    await dialog.locator('textarea').fill('## Согласование\n\nМинимум **два** согласующих.');
    await dialog.getByRole('button', { name: 'Сохранить' }).click();
    await expect(dialog).toBeHidden();
    await expect(band.locator('.stage-band__docs')).toHaveAttribute('title', /Минимум/);

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
    expect(xml).toContain('Минимум');

    // После перезагрузки Markdown остался в bs:stages и виден в подсказке.
    await page.reload();
    const reloaded = page.locator('.stage-band').first();
    await expect(reloaded.locator('.stage-band__docs')).toHaveAttribute('title', /\*\*два\*\*/);

    // Пустое значение очищает документацию и возвращает подсказку по умолчанию.
    await reloaded.locator('.stage-band__docs').click();
    const reopened = page.getByRole('dialog', { name: /Документация этапа/ });
    await reopened.locator('textarea').fill('');
    await reopened.getByRole('button', { name: 'Сохранить' }).click();
    await expect(reloaded.locator('.stage-band__docs')).toHaveAttribute(
      'title',
      'Документация этапа',
    );
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('этапы: элементы сдвигаются вместе с границей этапа', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E stages move ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const pool = page.locator('[data-element-id="Pool_1"]').first();
    await expect(pool).toBeVisible();
    await pool.click({ position: { x: 10, y: 30 } });
    await page.getByRole('button', { name: 'Свойства', exact: true }).click();
    await page.getByRole('checkbox', { name: /^Этапы/ }).check();
    await page.locator('.stage-band').first().locator('.stage-band__add').click();

    const bands = page.locator('.stage-band');
    await expect(bands).toHaveCount(2);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    const secondBand = (await bands.nth(1).boundingBox())!;
    const taskBox = (await task.boundingBox())!;
    await page.mouse.move(taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      secondBand.x + secondBand.width / 2,
      secondBand.y + secondBand.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    const movedTaskBox = (await task.boundingBox())!;
    expect(movedTaskBox.x).toBeGreaterThan(secondBand.x);

    const resizer = bands.first().locator('.stage-band__resizer');
    const resizerBox = (await resizer.boundingBox())!;
    await page.mouse.move(resizerBox.x + resizerBox.width / 2, resizerBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(resizerBox.x + resizerBox.width / 2 + 60, resizerBox.y + 80, {
      steps: 6,
    });
    await page.mouse.up();

    const taskAfterResize = (await task.boundingBox())!;
    expect(taskAfterResize.x).toBeGreaterThan(movedTaskBox.x + 40);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
