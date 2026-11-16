import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { openActions } from './helpers';

/**
 * Ключевой сценарий редактора (перенесён из ручных прогонов в /tmp):
 * чёрные стрелки, толстая граница завершающего события, своя тема,
 * комментарий к элементу и сохранение всего этого после перезагрузки.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

/** Границы фигуры из BPMNDI фикстуры — чтобы не зашивать координаты в тест. */
function edgeWaypoints(xml: string, edgeId: string) {
  const pattern = new RegExp(
    `<bpmndi:BPMNEdge[^>]*bpmnElement="${edgeId}"[^>]*>([\\s\\S]*?)</bpmndi:BPMNEdge>`,
  );
  const body = pattern.exec(xml)?.[1];
  if (!body) {
    throw new Error(`в фикстуре нет связи ${edgeId}`);
  }
  return [...body.matchAll(/<di:waypoint x="([\d.]+)" y="([\d.]+)"/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

function shapeBounds(xml: string, elementId: string) {
  const pattern = new RegExp(
    `<bpmndi:BPMNShape[^>]*bpmnElement="${elementId}"[^>]*>\\s*<dc:Bounds x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`,
  );
  const match = pattern.exec(xml);
  if (!match) {
    throw new Error(`в фикстуре нет фигуры ${elementId}`);
  }
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  };
}

test('закрепление нескольких выделенных элементов — одной командой undo', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E lock ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  const save = async () => {
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes(`/diagrams/${diagram.id}/bpmn`) &&
          response.request().method() === 'PUT' &&
          response.ok(),
      ),
      page.keyboard.press('ControlOrMeta+s'),
    ]);
    return (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
  };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    const endEvent = page.locator('[data-element-id="EndEvent_1"]').first();
    await expect(task).toBeVisible();

    await task.click();
    await page.keyboard.down('Shift');
    await endEvent.click();
    await page.keyboard.up('Shift');
    await endEvent.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Закрепить выбранные (2)' }).click();

    expect((await save()).match(/bs:locked="true"/g)).toHaveLength(2);

    // Один шаг undo снимает закрепление с обоих элементов.
    await page.keyboard.press('ControlOrMeta+z');
    expect((await save()).includes('bs:locked')).toBe(false);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('рамка ЛКМ выделяет элементы, а точки примыкания меняют концы связи', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E select ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const start = page.locator('[data-element-id="StartEvent_1"]').first();
    const end = page.locator('[data-element-id="EndEvent_1"]').first();
    await expect(start).toBeVisible();

    // ЛКМ по пустому холсту — рамка выделения (по умолчанию).
    const startBox = (await start.boundingBox())!;
    const endBox = (await end.boundingBox())!;
    await page.mouse.move(startBox.x - 24, startBox.y - 20);
    await page.mouse.down();
    await page.mouse.move(endBox.x + endBox.width + 24, endBox.y + endBox.height + 20, {
      steps: 8,
    });
    await expect(page.locator('.canvas-marquee')).toBeVisible();
    await page.mouse.up();
    await expect(start).toHaveClass(/selected/);
    await expect(end).toHaveClass(/selected/);
    // Точки примыкания: начало у задачи сверху, конец у события снизу.
    await page
      .locator('[data-element-id="Flow_2"]')
      .first()
      .dispatchEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 400 });
    await page.getByRole('menuitem', { name: 'Точки примыкания…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Точки примыкания связи' });
    const sourceGroup = dialog.getByRole('group', { name: /Начало/ });
    const targetGroup = dialog.getByRole('group', { name: /Конец/ });
    await sourceGroup.getByLabel('Сверху').check();
    await targetGroup.getByLabel('Снизу').check();
    await dialog.getByRole('button', { name: 'Применить' }).click();

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
    const waypoints = edgeWaypoints(xml, 'Flow_2');
    const anchorSourceBox = shapeBounds(sampleXml, 'Task_Review');
    const anchorTargetBox = shapeBounds(sampleXml, 'EndEvent_1');
    // Маршрут может прилипнуть к углу фигуры, но сторона должна остаться выбранной.
    expect(waypoints[0]!.y).toBe(anchorSourceBox.y);
    expect(waypoints.at(-1)!.y).toBe(anchorTargetBox.y + anchorTargetBox.height);
    expect(waypoints).toHaveLength(4);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('из всплывающего меню выбранного элемента создаётся следующий элемент', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E append ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();

    await task.click();
    const pad = page.locator('.djs-context-pad');
    await expect(pad).toBeVisible();
    const originalId = await task.getAttribute('data-element-id');
    await pad.locator('[data-action="append.append-task"]').click();
    await page.keyboard.press('Escape');

    // bpmn-js выдаёт новой задаче ID с префиксом Activity_, а не Task_.
    const appended = page.locator('.djs-shape.selected[data-element-id]');
    await expect(appended).toHaveCount(1);
    await expect(appended).not.toHaveAttribute('data-element-id', originalId ?? '');
    await expect(task).toBeVisible();
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

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
    await openActions(page);
    await page.getByRole('menuitem', { name: 'Тема' }).click();
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
    await openActions(page);
    await page.getByRole('menuitem', { name: /^Комментарии/ }).click();
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
