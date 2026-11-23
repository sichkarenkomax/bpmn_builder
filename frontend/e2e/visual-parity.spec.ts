import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

interface Viewbox {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

function svgViewbox(svg: string): Viewbox {
  const raw = /viewBox="([^"]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
  expect(raw).toHaveLength(4);
  return { x: raw![0]!, y: raw![1]!, width: raw![2]!, height: raw![3]!, scale: 1 };
}

async function canvasClip(
  page: Page,
  svgBox: Viewbox,
): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const host = page.locator('[data-testid="diagram-editor"]');
  const rect = await host.boundingBox();
  const viewbox = (await host.getAttribute('data-viewbox'))?.split(/\s+/).map(Number);
  expect(rect).not.toBeNull();
  expect(viewbox).toHaveLength(5);
  const [x, y, , , scale] = viewbox!;
  return {
    x: Math.round(rect!.x + (svgBox.x - x!) * scale!),
    y: Math.round(rect!.y + (svgBox.y - y!) * scale!),
    width: Math.round(svgBox.width * scale!),
    height: Math.round(svgBox.height * scale!),
  };
}

async function rasterizeSvg(page: Page, svg: string, width: number, height: number) {
  return page.evaluate(
    async ({ source, w, h }) => {
      const image = new Image();
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('SVG не отрисовался'));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('нет canvas');
      }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      return canvas.toDataURL('image/png').split(',')[1] ?? '';
    },
    { source: svg, w: width, h: height },
  );
}

async function pixelRatio(
  page: Page,
  first: Buffer,
  second: Buffer,
  trim: boolean,
): Promise<number> {
  return page.evaluate(
    async ({ a, b, trimBackground }) => {
      const load = (base64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('PNG не прочитан'));
          image.src = `data:image/png;base64,${base64}`;
        });

      const bounds = (data: Uint8ClampedArray, width: number, height: number) => {
        if (!trimBackground) {
          return { x: 0, y: 0, width, height };
        }
        let left = width;
        let top = height;
        let right = 0;
        let bottom = 0;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const index = (y * width + x) * 4;
            const isBackground =
              (data[index] ?? 255) > 244 &&
              (data[index + 1] ?? 255) > 244 &&
              (data[index + 2] ?? 255) > 244;
            if (!isBackground) {
              left = Math.min(left, x);
              top = Math.min(top, y);
              right = Math.max(right, x);
              bottom = Math.max(bottom, y);
            }
          }
        }
        return left > right
          ? { x: 0, y: 0, width, height }
          : {
              x: left,
              y: top,
              width: right - left + 1,
              height: bottom - top + 1,
            };
      };

      const normalized = async (image: HTMLImageElement) => {
        const source = document.createElement('canvas');
        source.width = image.naturalWidth;
        source.height = image.naturalHeight;
        const sourceContext = source.getContext('2d');
        if (!sourceContext) {
          throw new Error('нет canvas');
        }
        sourceContext.drawImage(image, 0, 0);
        const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
        const box = bounds(pixels.data, source.width, source.height);
        const target = document.createElement('canvas');
        target.width = 900;
        target.height = 560;
        const context = target.getContext('2d');
        if (!context) {
          throw new Error('нет canvas');
        }
        context.fillStyle = '#fff';
        context.fillRect(0, 0, target.width, target.height);
        const targetRatio = target.width / target.height;
        const sourceRatio = box.width / box.height;
        const drawWidth = sourceRatio > targetRatio ? target.width : target.height * sourceRatio;
        const drawHeight = sourceRatio > targetRatio ? target.width / sourceRatio : target.height;
        context.drawImage(
          source,
          box.x,
          box.y,
          box.width,
          box.height,
          (target.width - drawWidth) / 2,
          (target.height - drawHeight) / 2,
          drawWidth,
          drawHeight,
        );
        return context.getImageData(0, 0, target.width, target.height);
      };

      const [leftImage, rightImage] = await Promise.all([load(a), load(b)]);
      const [left, right] = await Promise.all([normalized(leftImage), normalized(rightImage)]);
      let changed = 0;
      for (let index = 0; index < left.data.length; index += 4) {
        const distance = Math.max(
          Math.abs((left.data[index] ?? 0) - (right.data[index] ?? 0)),
          Math.abs((left.data[index + 1] ?? 0) - (right.data[index + 1] ?? 0)),
          Math.abs((left.data[index + 2] ?? 0) - (right.data[index + 2] ?? 0)),
        );
        // Допуск на антиалиасинг и различия растеризации; геометрия и цвета
        // при таком пороге всё ещё сравниваются содержательно.
        if (distance > 120) {
          changed += 1;
        }
      }
      return changed / (left.width * left.height);
    },
    { a: first.toString('base64'), b: second.toString('base64'), trimBackground: trim },
  );
}

test('холст, SVG и PDF совпадают с допуском меньше 1% пикселей', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E visual ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };
  const temp = mkdtempSync(join(tmpdir(), 'bpmn-visual-'));

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Экспорт' }).click();
    let dialog = page.getByRole('dialog', { name: 'Экспорт диаграммы' });

    const svgDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /SVG/ }).click();
    const svgPath = await (await svgDownload).path();
    expect(svgPath).toBeTruthy();
    const svg = readFileSync(svgPath!, 'utf8');
    const box = svgViewbox(svg);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.locator('[data-testid="diagram-editor"]').click({ position: { x: 6, y: 6 } });

    const clip = await canvasClip(page, box);
    const canvasPng = await page.screenshot({ clip });
    const svgPng = Buffer.from(await rasterizeSvg(page, svg, clip.width, clip.height), 'base64');
    expect(clip.width).toBeGreaterThan(50);
    expect(await pixelRatio(page, canvasPng, svgPng, false)).toBeLessThan(0.01);

    await page.getByRole('button', { name: 'Экспорт' }).click();
    dialog = page.getByRole('dialog', { name: 'Экспорт диаграммы' });
    const pdfDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: /PDF/ }).click();
    const pdfPath = await (await pdfDownload).path();
    expect(pdfPath).toBeTruthy();
    const pdfBase = join(temp, 'page');
    execFileSync('pdftoppm', ['-png', '-r', '120', '-singlefile', pdfPath!, pdfBase]);
    const pdfPng = readFileSync(`${pdfBase}.png`);

    // PDF и SVG растеризуем в увеличенном масштабе: при сравнении с
    // низким разрешением антиалиасинг краёв сам по себе даёт около 1%.
    const svgHiPng = Buffer.from(
      await rasterizeSvg(page, svg, clip.width * 3, clip.height * 3),
      'base64',
    );
    expect(await pixelRatio(page, svgHiPng, pdfPng, true)).toBeLessThan(0.01);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
