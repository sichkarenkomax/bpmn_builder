import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const API = process.env.E2E_API_URL ?? 'http://127.0.0.1/api/v1';
const APP = process.env.E2E_BASE_URL ?? 'http://127.0.0.1';
const frames = mkdtempSync(join(tmpdir(), 'bpmn-demo-'));
const xml = readFileSync(resolve(root, 'frontend/e2e/fixtures/pool.bpmn'), 'utf8');

const created = await fetch(`${API}/diagrams`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Демо: обработка заявки', bpmn_xml: xml }),
});
if (!created.ok) {
  throw new Error(`Не удалось создать демо-диаграмму: ${created.status}`);
}
const diagram = await created.json();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let shot = 0;
const capture = async () => {
  await page.screenshot({ path: join(frames, `${String(shot).padStart(2, '0')}.png`) });
  shot += 1;
};

try {
  await page.goto(`${APP}/d/${diagram.id}`);
  await page.locator('[data-element-id="Task_Review"]').waitFor({ state: 'visible' });
  await capture();

  await page.getByRole('button', { name: 'Этапы' }).click();
  const dialog = page.getByRole('dialog', { name: 'Этапы схемы' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByRole('button', { name: 'Добавить этап' }).click();
  await dialog.getByLabel('Название этапа 1').fill('Согласование');
  await dialog.getByLabel('Ширина этапа 1').fill('180');
  await dialog.getByRole('button', { name: 'Добавить этап' }).click();
  await dialog.getByLabel('Название этапа 2').fill('Исполнение');
  await capture();

  await dialog.getByRole('button', { name: 'Применить' }).click();
  await page.locator('.stage-band').first().waitFor({ state: 'visible' });
  await capture();

  await page.getByRole('button', { name: 'Экспорт' }).click();
  await page.getByRole('dialog', { name: 'Экспорт диаграммы' }).waitFor({ state: 'visible' });
  await capture();
} finally {
  await browser.close();
  await fetch(`${API}/diagrams/${diagram.id}`, { method: 'DELETE' });
}

execFileSync(
  'uv',
  [
    'run',
    '--project',
    resolve(root, 'backend'),
    'python',
    resolve(here, 'make_gif.py'),
    frames,
    resolve(root, 'docs/assets/demo.gif'),
  ],
  { stdio: 'inherit' },
);
