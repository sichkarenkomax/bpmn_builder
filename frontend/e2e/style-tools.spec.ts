import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/simple.bpmn'), 'utf8');
const API = '/api/v1';

const gatewayXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bs="http://bpmn-studio.local/schema/bs" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:exclusiveGateway id="Gateway_1">
      <bpmn:outgoing>Flow_a</bpmn:outgoing>
      <bpmn:outgoing>Flow_b</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:task id="Task_a" name="Да" />
    <bpmn:task id="Task_b" name="Нет" />
    <bpmn:sequenceFlow id="Flow_a" sourceRef="Gateway_1" targetRef="Task_a" />
    <bpmn:sequenceFlow id="Flow_b" sourceRef="Gateway_1" targetRef="Task_b" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="P">
    <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1"><dc:Bounds x="200" y="200" width="50" height="50" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_a_di" bpmnElement="Task_a" bs:font-size="20"><dc:Bounds x="350" y="120" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_b_di" bpmnElement="Task_b"><dc:Bounds x="350" y="260" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_a_di" bpmnElement="Flow_a"><di:waypoint x="225" y="225" /><di:waypoint x="300" y="160" /><di:waypoint x="350" y="160" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_b_di" bpmnElement="Flow_b"><di:waypoint x="225" y="225" /><di:waypoint x="300" y="300" /><di:waypoint x="350" y="300" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

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

const longShapeLabelXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:startEvent id="Start" />
    <bpmn:intermediateThrowEvent id="Event_Long" name="Очень длинная вынесенная подпись события, которая не должна переразбиваться после перемещения" />
    <bpmn:endEvent id="End" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Event_Long" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Event_Long" targetRef="End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="P">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Event_Long_di" bpmnElement="Event_Long">
      <dc:Bounds x="250" y="100" width="36" height="36" />
      <bpmndi:BPMNLabel><dc:Bounds x="220" y="150" width="96" height="18" /></bpmndi:BPMNLabel>
    </bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="End_di" bpmnElement="End"><dc:Bounds x="400" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="136" y="118" /><di:waypoint x="250" y="118" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="286" y="118" /><di:waypoint x="400" y="118" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const longLabelXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="P" isExecutable="false">
    <bpmn:task id="Task_A" name="Начало" />
    <bpmn:task id="Task_B" name="Конец" />
    <bpmn:sequenceFlow id="Flow_Long" sourceRef="Task_A" targetRef="Task_B" name="Очень длинная подпись потока, которая не должна вылезать за правый край фрейма" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1"><bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="P">
    <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A"><dc:Bounds x="100" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B"><dc:Bounds x="400" y="100" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="Flow_Long_di" bpmnElement="Flow_Long">
      <di:waypoint x="200" y="140" /><di:waypoint x="400" y="140" />
      <bpmndi:BPMNLabel><dc:Bounds x="210" y="148" width="60" height="20" /></bpmndi:BPMNLabel>
    </bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function withResizeOthers(xml: string): string {
  return xml.replace(
    '<bpmn:definitions ',
    '<bpmn:definitions xmlns:bs="https://bpmn-studio.dev/schema/1.0" bs:resize-others="true" ',
  );
}

function withAnnotation(xml: string): string {
  return xml
    .replace(
      '  </bpmn:process>',
      '    <bpmn:textAnnotation id="Annotation_1"><bpmn:text>Комментарий</bpmn:text></bpmn:textAnnotation>\n  </bpmn:process>',
    )
    .replace(
      '    </bpmndi:BPMNPlane>',
      '      <bpmndi:BPMNShape id="Annotation_1_di" bpmnElement="Annotation_1">\n        <dc:Bounds x="540" y="180" width="100" height="30" />\n      </bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>',
    );
}

const resizableSampleXml = withResizeOthers(sampleXml);
const annotationSampleXml = withAnnotation(sampleXml);
const resizableAnnotationXml = withResizeOthers(annotationXml);

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

async function clickConnection(page: Page, elementId: string, button: 'left' | 'right' = 'left') {
  const point = await page
    .locator(`[data-element-id="${elementId}"] path.djs-hit`)
    .first()
    .evaluate((node) => {
      const path = node as SVGPathElement;
      const local = path.getPointAtLength(path.getTotalLength() / 2);
      const matrix = path.getScreenCTM()!;
      return {
        x: local.x * matrix.a + local.y * matrix.c + matrix.e,
        y: local.x * matrix.b + local.y * matrix.d + matrix.f,
      };
    });
  await page.mouse.click(point.x, point.y, { button });
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

test('связь комментария примыкает точками и идёт без диагоналей', async ({ page, request }) => {
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
    const points = [...edge!.matchAll(/<di:waypoint x="([\d.]+)" y="([\d.]+)"/g)].map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
    }));
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

test('подпись двигается свободно, а выравнивание не сдвигает её фрейм', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E label drag ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const event = page.locator('[data-element-id="StartEvent_1"]').first();
    const label = page.locator('[data-element-id="StartEvent_1_label"]').first();
    await expect(event).toBeVisible();
    await expect(label).toBeVisible();

    const before = (await label.boundingBox())!;
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 24, {
      steps: 8,
    });
    await page.mouse.up();

    const moved = (await label.boundingBox())!;
    expect(moved.x).toBeGreaterThan(before.x + 50);
    expect(moved.y).toBeGreaterThan(before.y + 10);

    // Выбор события и выравнивание текста не должны возвращать фрейм
    // к фигуре: двигается только текст внутри него.
    await event.click();
    await page.getByRole('button', { name: 'По левому краю' }).click();
    const aligned = (await label.boundingBox())!;
    expect(Math.abs(aligned.x - moved.x)).toBeLessThan(2);
    expect(Math.abs(aligned.y - moved.y)).toBeLessThan(2);
    await expect(label.locator('.djs-label')).toHaveAttribute('text-anchor', 'start');
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
    .replace(/<bpmn:textAnnotation[\s\S]*?<\/bpmn:textAnnotation>\s*<bpmn:association[^>]*\/>/, '')
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
      const edge = new RegExp(
        `<bpmndi:BPMNEdge[^>]*bpmnElement="${id}"[\\s\\S]*?</bpmndi:BPMNEdge>`,
      ).exec(xml)?.[0];
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

test('ПКМ: палитра смены типа открывается сразу и только с иконками', async ({ page, request }) => {
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
    await expect(page.getByRole('menuitem', { name: 'Сменить тип' })).toHaveCount(0);

    const items = page.locator('.replace-menu__item');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(1);
    expect((await items.allTextContents()).every((text) => text.trim() === '')).toBe(true);

    // Палитра стоит слева от меню, не выше него и не больше чем в две колонки.
    const paletteBox = (await page.locator('.replace-menu').boundingBox())!;
    const menuBox = (await page.locator('.context-menu').boundingBox())!;
    expect(paletteBox.x + paletteBox.width).toBeLessThanOrEqual(menuBox.x + 1);
    expect(paletteBox.height).toBeLessThanOrEqual(menuBox.height + 1);
    const columns = await page
      .locator('.replace-menu')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(2);

    await page.locator('.replace-menu__item[title="Service task"]').click();
    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('<bpmn:serviceTask id="Task_Review"');
    await expect(page.locator('.replace-menu')).toHaveCount(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('настройка: выключенная палитра прячется, но остаётся в меню', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E replace setting ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.addInitScript(() =>
      window.localStorage.setItem('bpmn-studio.type-palette', 'false'),
    );
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_Review"]').first();
    await expect(task).toBeVisible();
    await task.click({ button: 'right' });
    await expect(page.locator('.replace-menu')).toHaveCount(0);

    await page.getByRole('menuitem', { name: 'Сменить тип' }).click();
    await expect(page.locator('.replace-menu__item').first()).toBeVisible();
    await expect(page.locator('.context-menu')).toHaveCount(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('ресайз события: ручки доступны, размер сохраняется', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E event resize ${Date.now()}`, bpmn_xml: resizableSampleXml },
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

test('событие при ресайзе остаётся круглым, контур совпадает', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E event outline ${Date.now()}`, bpmn_xml: resizableSampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const event = page.locator('[data-element-id="EndEvent_1"]').first();
    await expect(event).toBeVisible();
    await event.click();

    const handle = page.locator('.djs-resizer-EndEvent_1.djs-resizer-e .djs-resizer-hit');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    const bounds = shapeBounds(xml, 'EndEvent_1');
    // Круг не должен превращаться в овал: рамка остаётся квадратной.
    expect(bounds.width).toBeGreaterThan(36);
    expect(bounds.width).toBeCloseTo(bounds.height, 0);

    // Событие рисуется кругом r=(w+h)/4; контур — на 6 px больше (и +1 у финиша).
    const outlineR = await event
      .locator('.djs-outline')
      .evaluate((node) => Number(node.getAttribute('r')));
    expect(outlineR).toBeCloseTo((bounds.width + bounds.height) / 4 + 7, 0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('контур стартового события остаётся круглым после ресайза', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E start event outline ${Date.now()}`, bpmn_xml: resizableSampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const event = page.locator('[data-element-id="StartEvent_1"]').first();
    await expect(event).toBeVisible();
    await event.click();
    await expect(event.locator('.djs-outline')).toHaveJSProperty('tagName', 'circle');

    const handle = page.locator('.djs-resizer-StartEvent_1.djs-resizer-e .djs-resizer-hit');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    const outline = await event.locator('.djs-outline').evaluate((node) => ({
      tag: node.tagName,
      cx: Number(node.getAttribute('cx')),
      cy: Number(node.getAttribute('cy')),
      r: Number(node.getAttribute('r')),
    }));
    const circle = await event
      .locator('.djs-visual circle')
      .first()
      .evaluate((node) => Number(node.getAttribute('r')));
    expect(outline.tag).toBe('circle');
    expect(outline.cx).toBeCloseTo(outline.cy, 0);
    expect(outline.r).toBeGreaterThan(circle + 5);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('поток по умолчанию из ПКМ и сброс размера', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E default flow ${Date.now()}`, bpmn_xml: gatewayXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Gateway_1"]').first()).toBeVisible();

    // ПКМ по потоку от шлюза: назначаем поток по умолчанию.
    await clickConnection(page, 'Flow_a', 'right');
    await page.getByRole('menuitem', { name: 'Сделать потоком по умолчанию' }).click();
    await saveDiagram(page, diagram.id);
    let xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('default="Flow_a"');

    // Повторный ПКМ снимает признак.
    await clickConnection(page, 'Flow_a', 'right');
    await page.getByRole('menuitem', { name: 'Снять поток по умолчанию' }).click();
    await saveDiagram(page, diagram.id);
    xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).not.toContain('default="Flow_a"');

    // Горячая клавиша Shift+D назначает поток по умолчанию.
    await clickConnection(page, 'Flow_b');
    await page.keyboard.press('Shift+D');
    await saveDiagram(page, diagram.id);
    xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('default="Flow_b"');

    // Ресайз задачи и сброс к стандартным 100×80.
    await page.locator('[data-element-id="Task_a"]').first().click();
    const handle = page.locator('.djs-resizer-Task_a.djs-resizer-se .djs-resizer-hit');
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    await page.locator('[data-element-id="Task_a"]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Сбросить размер' }).click();
    await saveDiagram(page, diagram.id);
    xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    const bounds = shapeBounds(xml, 'Task_a');
    expect(bounds.width).toBe(100);
    expect(bounds.height).toBe(80);

    // Сброс форматирования убирает bs-атрибуты стиля.
    await page.locator('[data-element-id="Task_a"]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Сбросить форматирование' }).click();
    await saveDiagram(page, diagram.id);
    xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).not.toContain('bs:font-size');
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
    // Многострочность сохраняется: вертикаль — это поворот текста на +90°,
    // а не writing-mode, который склеивал строки в один столбец.
    await expect
      .poll(() =>
        task
          .locator('.djs-label')
          .first()
          .evaluate((node) => (node as SVGElement).style.transform),
      )
      .toBe('rotate(90deg)');

    // Ресайз задачи — тянем правый нижний угол (элемент уже выбран).
    const taskHandle = page.locator('.djs-resizer-Task_Review.djs-resizer-se .djs-resizer-hit');
    await expect(taskHandle).toBeVisible();
    const taskHandleBox = (await taskHandle.boundingBox())!;
    await page.mouse.move(
      taskHandleBox.x + taskHandleBox.width / 2,
      taskHandleBox.y + taskHandleBox.height / 2,
    );
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
    expect(Math.abs(flow[0]!.y - (resizedTask.y + resizedTask.height / 2))).toBeLessThanOrEqual(1);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('многострочная вынесенная подпись сохраняет строки при повороте', async ({
  page,
  request,
}) => {
  const multilineXml = sampleXml.replace('name="Готово"', 'name="Первая строка&#10;Вторая строка"');
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E multiline label ${Date.now()}`, bpmn_xml: multilineXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const event = page.locator('[data-element-id="EndEvent_1"]').first();
    const label = page.locator('[data-element-id="EndEvent_1_label"]').first();
    await expect(event).toBeVisible();
    await expect(label).toBeVisible();
    await event.click();

    const lines = label.locator('.djs-label tspan');
    await expect(lines).toHaveCount(2);

    // Поворот не должен склеивать строки: после −90° они идут столбцами,
    // то есть различаются по X, а не по Y.
    await page.getByRole('button', { name: 'Направление текста: поворот' }).click();
    await expect
      .poll(() =>
        label.locator('.djs-visual').evaluate((node) => (node as SVGElement).style.transform),
      )
      .toContain('rotate(-90deg)');
    const rotated = await lines.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()),
    );
    expect(rotated).toHaveLength(2);
    expect(Math.abs(rotated[0]!.x - rotated[1]!.x)).toBeGreaterThan(5);
    expect(Math.abs(rotated[0]!.y - rotated[1]!.y)).toBeLessThan(5);

    // В обратную сторону (+90°) строки тоже остаются раздельными.
    await page.getByRole('button', { name: 'Направление текста: вертикально' }).click();
    await expect
      .poll(() =>
        label.locator('.djs-visual').evaluate((node) => (node as SVGElement).style.transform),
      )
      .toContain('rotate(90deg)');
    const upright = await lines.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON()),
    );
    expect(upright).toHaveLength(2);
    expect(Math.abs(upright[0]!.x - upright[1]!.x)).toBeGreaterThan(5);
    expect(Math.abs(upright[0]!.y - upright[1]!.y)).toBeLessThan(5);

    // Направление и строки переживают сохранение и перезагрузку.
    await saveDiagram(page, diagram.id);
    await page.reload();
    const reloaded = page.locator('[data-element-id="EndEvent_1_label"]').first();
    await expect(reloaded).toBeVisible();
    await expect(reloaded.locator('.djs-label tspan')).toHaveCount(2);
    await expect
      .poll(() =>
        reloaded.locator('.djs-visual').evaluate((node) => (node as SVGElement).style.transform),
      )
      .toContain('rotate(90deg)');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('настройки ресайза скрывают ручки и сохраняются в схеме', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E resize settings ${Date.now()}`, bpmn_xml: annotationSampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const event = page.locator('[data-element-id="StartEvent_1"]').first();
    const task = page.locator('[data-element-id="Task_Review"]').first();
    const annotation = page.locator('[data-element-id="Annotation_1"]').first();
    await expect(event).toBeVisible();

    // По умолчанию задачи и комментарии ресайзятся, события — нет.
    await event.click();
    await expect(page.locator('.djs-resizer-StartEvent_1')).toHaveCount(0);
    await annotation.click();
    await expect(page.locator('.djs-resizer-Annotation_1')).toHaveCount(8);
    await task.click();
    await expect(page.locator('.djs-resizer-Task_Review')).toHaveCount(8);

    await page.getByRole('button', { name: 'Настройки размеров' }).click();
    const dialog = page.getByRole('dialog', { name: 'Настройки размеров' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Разрешить менять размеры событий, шлюзов и данных').check();
    await dialog
      .getByLabel('Разрешить менять размеры задач, подпроцессов и комментариев')
      .uncheck();
    await dialog.getByRole('button', { name: 'Готово' }).click();

    await event.click();
    await expect(page.locator('.djs-resizer-StartEvent_1')).toHaveCount(8);
    await annotation.click();
    await expect(page.locator('.djs-resizer-Annotation_1')).toHaveCount(0);
    await task.click();
    await expect(page.locator('.djs-resizer-Task_Review')).toHaveCount(0);

    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('bs:resize-tasks="false"');
    expect(xml).toContain('bs:resize-others="true"');

    // Настройки переживают перезагрузку и не сбрасываются на дефолты.
    await page.reload();
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();
    await page.locator('[data-element-id="StartEvent_1"]').first().click();
    await expect(page.locator('.djs-resizer-StartEvent_1')).toHaveCount(8);
    await page.locator('[data-element-id="Annotation_1"]').first().click();
    await expect(page.locator('.djs-resizer-Annotation_1')).toHaveCount(0);
    await page.locator('[data-element-id="Task_Review"]').first().click();
    await expect(page.locator('.djs-resizer-Task_Review')).toHaveCount(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('длинная подпись связи центрируется и не выходит за фрейм', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E label layout ${Date.now()}`, bpmn_xml: longLabelXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const label = page.locator('[data-element-id="Flow_Long_label"]');
    await expect(label).toBeVisible();

    const measure = () =>
      label.evaluate((owner) => {
        const text = owner.querySelector('.djs-label')!;
        const hit = owner.querySelector('.djs-hit')!;
        const bbox = text.getBBox();
        return {
          anchor: text.getAttribute('text-anchor'),
          right: bbox.x + bbox.width,
          bottom: bbox.y + bbox.height,
          width: Number(hit.getAttribute('width')),
          height: Number(hit.getAttribute('height')),
          lines: [...text.querySelectorAll('tspan')].map((line) => line.textContent),
        };
      });

    const before = await measure();
    expect(before.anchor).toBe('middle');
    expect(before.right).toBeLessThanOrEqual(before.width);
    expect(before.bottom).toBeLessThanOrEqual(before.height);

    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 50, box!.y + box!.height / 2 + 20, {
      steps: 8,
    });
    await page.mouse.up();

    const after = await measure();
    expect(after.lines).toEqual(before.lines);
    expect(after.anchor).toBe('middle');
    expect(after.right).toBeLessThanOrEqual(after.width);
    expect(after.bottom).toBeLessThanOrEqual(after.height);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('вынесенная подпись события сохраняет строки после перемещения', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E shape label ${Date.now()}`, bpmn_xml: longShapeLabelXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const label = page.locator('[data-element-id="Event_Long_label"]');
    await expect(label).toBeVisible();

    const measure = () =>
      label.evaluate((owner) => {
        const text = owner.querySelector('.djs-label')!;
        const hit = owner.querySelector('.djs-hit')!;
        const bbox = text.getBBox();
        return {
          anchor: text.getAttribute('text-anchor'),
          right: bbox.x + bbox.width,
          bottom: bbox.y + bbox.height,
          width: Number(hit.getAttribute('width')),
          height: Number(hit.getAttribute('height')),
          lines: [...text.querySelectorAll('tspan')].map((line) => line.textContent),
        };
      });

    const before = await measure();
    expect(before.anchor).toBe('middle');
    expect(before.lines.length).toBeGreaterThan(1);
    expect(before.right).toBeLessThanOrEqual(before.width);
    expect(before.bottom).toBeLessThanOrEqual(before.height);

    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 40, box!.y + box!.height / 2 + 20, {
      steps: 8,
    });
    await page.mouse.up();

    const after = await measure();
    expect(after.lines).toEqual(before.lines);
    expect(after.anchor).toBe('middle');
    expect(after.right).toBeLessThanOrEqual(after.width);
    expect(after.bottom).toBeLessThanOrEqual(after.height);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('портальные дефолты применяются к новой схеме', async ({ page, request }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem(
      'bpmn-studio.portal-defaults',
      JSON.stringify({
        theme: 'colored',
        canvas: 'dark',
        resizeTasks: false,
        resizeOthers: true,
      }),
    );
  });
  await page.reload();
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/diagrams') &&
      response.request().method() === 'POST' &&
      response.ok(),
  );
  await page.getByRole('button', { name: 'Демо-процесс' }).click();
  await page.waitForURL(/\/d\/[0-9a-f-]+/);
  const diagram = (await (await created).json()) as { id: string };

  try {
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    expect(xml).toContain('bs:resize-tasks="false"');
    expect(xml).toContain('bs:resize-others="true"');
    expect(xml).toContain('bs:theme="colored"');
    expect(xml).toContain('bs:canvas="dark"');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
    await page.evaluate(() => window.localStorage.removeItem('bpmn-studio.portal-defaults'));
  }
});

test('ручки ресайза стоят на углах повёрнутого фрейма', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E rotated resizers ${Date.now()}`, bpmn_xml: resizableAnnotationXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const annotation = page.locator('[data-element-id="Annotation_1"]').first();
    await expect(annotation).toBeVisible();
    await annotation.click();

    await page.getByRole('button', { name: 'Направление текста: вертикально' }).click();
    const handle = page.locator('.djs-resizer-Annotation_1.djs-resizer-se');
    await expect.poll(() => handle.getAttribute('transform')).toContain('rotate(90 ');
    // Сами квадратики остаются прямыми: группа повёрнута, ручка — обратно.
    await expect
      .poll(() => handle.locator('.djs-resizer-visual').getAttribute('transform'))
      .toContain('rotate(-90 ');

    await page.getByRole('button', { name: 'Направление текста: поворот' }).click();
    await expect.poll(() => handle.getAttribute('transform')).toContain('rotate(-90 ');

    // Тянем повёрнутую ручку наружу: в осях рамки это рост обеих сторон.
    await page.getByRole('button', { name: 'Направление текста: вертикально' }).click();
    const handleBox = (await handle.boundingBox())!;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 - 20,
      handleBox.y + handleBox.height / 2 + 20,
      { steps: 5 },
    );
    // Превью тоже должно быть повёрнуто, а не растягиваться в ширину.
    await expect
      .poll(() => page.locator('.djs-resize-overlay').getAttribute('transform'))
      .toContain('rotate(90 ');
    await page.mouse.up();

    await saveDiagram(page, diagram.id);
    const xml = await (await request.get(`${API}/diagrams/${diagram.id}/bpmn`)).text();
    const resized = shapeBounds(xml, 'Annotation_1');
    expect(resized.width).toBeGreaterThan(100);
    expect(resized.height).toBeGreaterThan(30);

    // В осях холста правый верхний угол повёрнутой рамки остаётся на месте:
    // при ±90° видимая рамка — это (x + (w-h)/2, y + (h-w)/2, h, w).
    const visual = (bounds: { x: number; y: number; width: number; height: number }) => ({
      x: bounds.x + (bounds.width - bounds.height) / 2,
      y: bounds.y + (bounds.height - bounds.width) / 2,
      width: bounds.height,
      height: bounds.width,
    });
    const beforeVisual = visual({ x: 450, y: 300, width: 100, height: 30 });
    const afterVisual = visual(resized);
    expect(afterVisual.x + afterVisual.width).toBeCloseTo(beforeVisual.x + beforeVisual.width, 0);
    expect(afterVisual.y).toBeCloseTo(beforeVisual.y, 0);

    // После перезагрузки контур создаётся лениво и тоже должен быть повёрнут.
    await page.reload();
    const reloaded = page.locator('[data-element-id="Annotation_1"]').first();
    await reloaded.click();
    await expect
      .poll(() =>
        reloaded.locator('.djs-outline').evaluate((node) => (node as SVGElement).style.transform),
      )
      .toContain('rotate(90deg)');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
