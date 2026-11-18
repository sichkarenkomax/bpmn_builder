import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

test('двойной и тройной щелчок выделяют текст при редактировании', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E label ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.dblclick();

    const editor = page.locator('.djs-direct-editing-content');
    await expect(editor).toBeVisible();
    await editor.dblclick();
    const word = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(word.length).toBeGreaterThan(0);

    await editor.click({ clickCount: 3 });
    const line = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(line).toContain('Проверить');
    expect(line).toContain('заявку');
    await editor.press('ControlOrMeta+a');
    const all = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(all).toContain('Проверить');
    await expect(editor).toBeVisible();
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('экспорт SVG и JSON из текущего холста, фокус остаётся в диалоге', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E export ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Экспорт' }).click();
    const dialog = page.getByRole('dialog', { name: 'Экспорт диаграммы' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(':focus')).toHaveCount(1);

    const svgDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /SVG/ }).click();
    const svg = await svgDownload;
    expect(svg.suggestedFilename()).toMatch(/\.svg$/);
    const svgPath = await svg.path();
    expect(svgPath).toBeTruthy();
    if (svgPath) {
      const content = readFileSync(svgPath, 'utf8');
      expect(content).toContain('<svg');
      expect(content).toContain('Task_Review');
    }

    const jsonDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /JSON/ }).click();
    const json = await jsonDownload;
    expect(json.suggestedFilename()).toMatch(/\.json$/);
    const jsonPath = await json.path();
    expect(jsonPath).toBeTruthy();
    if (jsonPath) {
      const payload = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        processes: { nodes: unknown[] }[];
      };
      expect(payload.processes[0]?.nodes.length).toBeGreaterThan(0);
    }

    // Серверный экспорт попадает в историю; оттуда файл можно скачать повторно.
    const historyItem = dialog.locator('.export-history__item').filter({ hasText: 'JSON' });
    await expect(historyItem).toBeVisible();
    await expect(historyItem.locator('.export-history__status')).toHaveText('готово');
    const historyDownload = page.waitForEvent('download');
    await historyItem.getByRole('button', { name: 'Скачать' }).click();
    expect((await historyDownload).suggestedFilename()).toMatch(/\.json$/);

    const pdfDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /PDF/ }).click();
    const pdf = await pdfDownload;
    const pdfPath = await pdf.path();
    expect(pdfPath).toBeTruthy();
    if (pdfPath) {
      const content = readFileSync(pdfPath);
      expect(content.subarray(0, 5).toString()).toBe('%PDF-');
      expect(content.includes(Buffer.from('/Subtype /Image'))).toBe(false);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
