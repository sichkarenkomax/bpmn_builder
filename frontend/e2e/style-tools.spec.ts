import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

const annotationXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:task id="Task_1" name="Задача" />
    <bpmn:textAnnotation id="Annotation_1"><bpmn:text>Комментарий</bpmn:text></bpmn:textAnnotation>
    <bpmn:association id="Association_1" sourceRef="Task_1" targetRef="Annotation_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="P">
    <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="200" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Annotation_1_di" bpmnElement="Annotation_1"><dc:Bounds x="450" y="300" width="100" height="30" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Association_1_di" bpmnElement="Association_1"><di:waypoint x="300" y="180" /><di:waypoint x="450" y="300" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function shapeBounds(xml: string, elementId: string) {
  const pattern = new RegExp(
    `<bpmndi:BPMNShape[^>]*bpmnElement="${elementId}"[^>]*>\\s*<dc:Bounds x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`,
  );
  const match = pattern.exec(xml);
  if (!match) {
    throw new Error(`нет фигуры ${elementId}`);
  }
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    width: Number(match[3]),
    height: Number(match[4]),
  };
}

function edgeWaypoints(xml: string, elementId: string) {
  const pattern = new RegExp(
    `<bpmndi:BPMNEdge[^>]*bpmnElement="${elementId}"[\\s\\S]*?</bpmndi:BPMNEdge>`,
  );
  const edge = pattern.exec(xml)?.[0];
  if (!edge) {
    throw new Error(`нет связи ${elementId}`);
  }
  return [...edge.matchAll(/<di:waypoint x="([\d.]+)" y="([\d.]+)"/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
}

async function saveDiagram(page: Page, diagramId: string) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/diagrams/${diagramId}/bpmn`) &&
        response.request().method() === 'PUT' &&
        response.ok(),
    ),
    page.keyboard.press('ControlOrMeta+s'),
  ]);
}

test('связь комментария примыкает точками и идёт без диагоналей', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E association ${Date.now()}`, bpmn_xml: annotationXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Task_1"]').first()).toBeVisible();

    // Связь нарисована точками, а не тире.
    const associationStyle = await page
      .locator('[data-element-id="Association_1"] .djs-visual path')
      .first()
      .evaluate((node) => ({
        dash: getComputedStyle(node).strokeDasharray,
        cap: getComputedStyle(node).strokeLinecap,
      }));
    expect(associationStyle.dash).toContain('0px');
    expect(associationStyle.cap).toBe('round');

    // Старая диагональная связь чинится при открытии схемы.
    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    const edge = /<bpmndi:BPMNEdge[^>]*bpmnElement="Association_1"[\s\S]*?<\/bpmndi:BPMNEdge>/.exec(
      xml,
    )?.[0];
    expect(edge).toBeTruthy();
    const points = [...edge!.matchAll(/<di:waypoint x="([\d.]+)" y="([\d.]+)"/g)].map(
      (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
    );
    expect(points.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const current = points[index]!;
      expect(
        previous.x === current.x || previous.y === current.y,
        `диагональный отрезок: ${JSON.stringify(previous)} → ${JSON.stringify(current)}`,
      ).toBe(true);
    }
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('связи документа и БД тоже идут ортогонально', async ({ page, request }) => {
  const dataXml = annotationXml
    .replace(
      '<bpmn:task id="Task_1" name="Задача" />',
      `<bpmn:userTask id="Task_1" name="Задача">
        <bpmn:dataInputAssociation id="DataInputAssociation_1">
          <bpmn:sourceRef>DataObjectReference_1</bpmn:sourceRef>
          <bpmn:targetRef>Task_1</bpmn:targetRef>
        </bpmn:dataInputAssociation>
        <bpmn:dataOutputAssociation id="DataOutputAssociation_1">
          <bpmn:sourceRef>Task_1</bpmn:sourceRef>
          <bpmn:targetRef>DataStoreReference_1</bpmn:targetRef>
        </bpmn:dataOutputAssociation>
      </bpmn:userTask>
      <bpmn:dataObject id="DataObject_1" />
      <bpmn:dataObjectReference id="DataObjectReference_1" dataObjectRef="DataObject_1" name="Документ" />
      <bpmn:dataStoreReference id="DataStoreReference_1" name="БД" />`,
    )
    .replace(
      /<bpmn:textAnnotation[\s\S]*?<\/bpmn:textAnnotation>\s*<bpmn:association[^>]*\/>/,
      '',
    )
    .replace(
      /<bpmndi:BPMNShape id="Annotation_1_di"[\s\S]*?<\/bpmndi:BPMNShape>/, 
      '<bpmndi:BPMNShape id="DataObjectReference_1_di" bpmnElement="DataObjectReference_1"><dc:Bounds x="120" y="80" width="36" height="50" /></bpmndi:BPMNShape>\n    <bpmndi:BPMNShape id="DataStoreReference_1_di" bpmnElement="DataStoreReference_1"><dc:Bounds x="500" y="380" width="50" height="50" /></bpmndi:BPMNShape>',
    )
    .replace(
      /<bpmndi:BPMNEdge id="Association_1_di"[\s\S]*?<\/bpmndi:BPMNEdge>/,
      '<bpmndi:BPMNEdge id="DataInputAssociation_1_di" bpmnElement="DataInputAssociation_1"><di:waypoint x="156" y="105" /><di:waypoint x="300" y="240" /></bpmndi:BPMNEdge>\n    <bpmndi:BPMNEdge id="DataOutputAssociation_1_di" bpmnElement="DataOutputAssociation_1"><di:waypoint x="400" y="280" /><di:waypoint x="500" y="405" /></bpmndi:BPMNEdge>',
    );

  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E data assoc ${Date.now()}`, bpmn_xml: dataXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Task_1"]').first()).toBeVisible();
    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();

    for (const id of ['DataInputAssociation_1', 'DataOutputAssociation_1']) {
      const edge = new RegExp(`<bpmndi:BPMNEdge[^>]*bpmnElement="${id}"[\\s\\S]*?</bpmndi:BPMNEdge>`).exec(
        xml,
      )?.[0];
      expect(edge).toBeTruthy();
      const points = [...edge!.matchAll(/<di:waypoint x="([\d.]+)" y="([\d.]+)"/g)].map(
        (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
      );
      expect(points.length).toBeGreaterThanOrEqual(3);
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]!;
        const current = points[index]!;
        expect(previous.x === current.x || previous.y === current.y).toBe(true);
      }
    }
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('ПКМ: смена типа открывается компактным меню только с иконками', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E replace menu ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Сменить тип' }).click();

    const items = page.locator('.replace-menu__item');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(1);
    expect((await items.allTextContents()).every((text) => text.trim() === '')).toBe(true);

    await page.locator('.replace-menu__item[title="Service task"]').click();
    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('<bpmn:serviceTask id="Task_Review"');
    await expect(page.locator('.replace-menu')).toHaveCount(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('ресайз события: ручки доступны, размер сохраняется', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E event resize ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const event = page.locator('[data-element-id="EndEvent_1"]').first();
    await expect(event).toBeVisible();
    await event.click();

    const handle = page.locator('.djs-resizer-EndEvent_1.djs-resizer-se .djs-resizer-hit');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, {
      steps: 6,
    });
    await page.mouse.up();

    // Контур выделения должен вырасти вместе с событием.
    const outline = await event.locator('.djs-outline').evaluate((node) => ({
      r: Number(node.getAttribute('r')),
    }));
    expect(outline.r).toBeGreaterThan(36 / 2 + 5);

    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    const eventBounds = shapeBounds(xml, 'EndEvent_1');
    expect(eventBounds.width).toBeGreaterThan(36);

    // Конец входящего потока остаётся на середине левой стороны события.
    const waypoints = edgeWaypoints(xml, 'Flow_2');
    const end = waypoints[waypoints.length - 1]!;
    expect(Math.abs(end.x - eventBounds.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(end.y - (eventBounds.y + eventBounds.height / 2))).toBeLessThanOrEqual(1);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('направление текста сохраняется в DI', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E style tools ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.click();

    await page.getByRole('button', { name: 'Направление текста: вертикально' }).click();
    await expect(
      page.getByRole('button', { name: 'Направление текста: вертикально' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() =>
        task
          .locator('.djs-label')
          .first()
          .evaluate((node) => getComputedStyle(node).writingMode),
      )
      .toBe('vertical-rl');

    // Ресайз задачи — тянем правый нижний угол (элемент уже выбран).
    const taskHandle = page.locator('.djs-resizer-Task_Review.djs-resizer-se .djs-resizer-hit');
    await expect(taskHandle).toBeVisible();
    const taskHandleBox = (await taskHandle.boundingBox())!;
    await page.mouse.move(taskHandleBox.x + taskHandleBox.width / 2, taskHandleBox.y + taskHandleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      taskHandleBox.x + taskHandleBox.width / 2 + 40,
      taskHandleBox.y + taskHandleBox.height / 2 + 20,
      { steps: 6 },
    );
    await page.mouse.up();

    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('bs:text-direction="vertical"');
    const resizedTask = shapeBounds(xml, 'Task_Review');
    expect(resizedTask.width).toBeGreaterThan(100);
    expect(resizedTask.height).toBeGreaterThan(80);

    // Исходящий поток остаётся на середине правой стороны задачи.
    const flow = edgeWaypoints(xml, 'Flow_2');
    expect(Math.abs(flow[0]!.x - (resizedTask.x + resizedTask.width))).toBeLessThanOrEqual(1);
    expect(
      Math.abs(flow[0]!.y - (resizedTask.y + resizedTask.height / 2)),
    ).toBeLessThanOrEqual(1);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
