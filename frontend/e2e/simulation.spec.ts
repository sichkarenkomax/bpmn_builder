import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/pool.bpmn'), 'utf8');
const API = '/api/v1';

/** Токен должен стоять по центру элемента, а не на конце входящего потока. */
async function tokenOffset(page: Page, elementId: string): Promise<number> {
  return page.evaluate((id) => {
    const token = document.querySelector('[data-testid="sim-tokens"] .sim-token');
    const element = document.querySelector(`[data-element-id="${id}"]`);
    if (!token || !element) {
      return Number.POSITIVE_INFINITY;
    }
    const tokenBox = token.getBoundingClientRect();
    const elementBox = element.getBoundingClientRect();
    const dx = tokenBox.x + tokenBox.width / 2 - (elementBox.x + elementBox.width / 2);
    const dy = tokenBox.y + tokenBox.height / 2 - (elementBox.y + elementBox.height / 2);
    return Math.max(Math.abs(dx), Math.abs(dy));
  }, elementId);
}

async function expectTokenAt(page: Page, elementId: string) {
  await expect.poll(() => tokenOffset(page, elementId), { timeout: 3000 }).toBeLessThan(8);
}

/** Минимальное отклонение токена от элемента за время анимации. */
async function minTokenOffsetDuring(page: Page, elementId: string, ms: number): Promise<number> {
  const deadline = Date.now() + ms;
  let min = Number.POSITIVE_INFINITY;
  while (Date.now() < deadline) {
    min = Math.min(min, await tokenOffset(page, elementId));
    await page.waitForTimeout(25);
  }
  return min;
}

// Шлюз с условием на неизвестной переменной: ветку выбирает пользователь.
const decisionXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn-studio.dev/test">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start" name="Старт"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:exclusiveGateway id="Split" name="Проверка"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>FNo</bpmn:outgoing><bpmn:outgoing>FYes</bpmn:outgoing></bpmn:exclusiveGateway>
    <bpmn:endEvent id="EndNo" name="Отказано"><bpmn:incoming>FNo</bpmn:incoming></bpmn:endEvent>
    <bpmn:endEvent id="EndYes" name="Одобрено"><bpmn:incoming>FYes</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Split" />
    <bpmn:sequenceFlow id="FNo" name="Нет" sourceRef="Split" targetRef="EndNo"><bpmn:conditionExpression>ok == true</bpmn:conditionExpression></bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="FYes" name="Да" sourceRef="Split" targetRef="EndYes" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dia"><bpmndi:BPMNPlane id="Plane" bpmnElement="P">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Split_di" bpmnElement="Split"><dc:Bounds x="200" y="95" width="50" height="50" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndNo_di" bpmnElement="EndNo"><dc:Bounds x="320" y="40" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="EndYes_di" bpmnElement="EndYes"><dc:Bounds x="320" y="160" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="136" y="118" /><di:waypoint x="200" y="120" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="FNo_di" bpmnElement="FNo"><di:waypoint x="225" y="95" /><di:waypoint x="225" y="58" /><di:waypoint x="320" y="58" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="FYes_di" bpmnElement="FYes"><di:waypoint x="225" y="145" /><di:waypoint x="225" y="178" /><di:waypoint x="320" y="178" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test('симуляция: прогон линейного процесса, шаги и подсветка (этап 3)', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    await expect(panel).toBeVisible();

    // Прогон идёт по сохранённой версии: старт → задача → конец.
    await expect(panel.getByRole('status')).toContainText('Завершено: 3 шагов');
    const steps = panel.locator('.simulation-panel__step');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(0)).toHaveText(/Заявка получена/);
    await expect(steps.nth(1)).toHaveText(/Проверить заявку/);

    // Текущий шаг подсвечен, токен виден поверх холста.
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toHaveClass(
      /bpmn-sim-active/,
    );
    const token = page.getByTestId('sim-tokens').locator('.sim-token');
    await expect(token).toHaveCount(1);
    await expect(token).toHaveText('1');
    // Токен стоит по центру элемента, а не в углу холста.
    await expectTokenAt(page, 'StartEvent_1');
    const startPosition = await token.getAttribute('style');

    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    // Токен уезжает по потоку и приезжает в центр следующего элемента.
    await expect(token).not.toHaveAttribute('style', startPosition ?? '');
    await expectTokenAt(page, 'Task_Review');
    await expect(panel.locator('.simulation-panel__current')).toContainText('Проверить заявку');
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toHaveClass(
      /bpmn-sim-active/,
    );
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toHaveClass(
      /bpmn-sim-visited/,
    );

    // Счётчики прохождений и тепловая карта: бейджи с числом визитов.
    await expect(panel.locator('.simulation-panel__counts')).toContainText('Прохождения');
    const heatmap = panel.getByRole('checkbox', { name: 'Тепловая карта' });
    await heatmap.check();
    await expect(page.locator('.sim-heat').first()).toBeVisible();
    await expect(page.locator('.sim-heat').first()).toHaveText('1');
    await heatmap.uncheck();
    await expect(page.locator('.sim-heat')).toHaveCount(0);
    await panel.getByRole('button', { name: 'Закрыть' }).click();
    await expect(panel).toBeHidden();
    await expect(page.locator('[data-element-id="Task_Review"]').first()).not.toHaveClass(
      /bpmn-sim-active/,
    );
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: токен остаётся на элементе при панораме полотна', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation pan ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    await expectTokenAt(page, 'StartEvent_1');

    const editor = page.getByTestId('diagram-editor');
    const before = await editor.getAttribute('data-viewbox');
    const canvas = page.locator('.canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      return;
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 180);
    await expect.poll(() => editor.getAttribute('data-viewbox')).not.toBe(before);

    // Проверяем сразу после панорамы: при старой анимации токен ещё ехал бы
    // от экранной позиции и заметно отставал от фигуры.
    await page.waitForTimeout(50);
    expect(await tokenOffset(page, 'StartEvent_1')).toBeLessThan(8);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: шаг назад ведёт токен прямо к предыдущему элементу', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation back ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await expectTokenAt(page, 'Task_Review');
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await expectTokenAt(page, 'EndEvent_1');

    // Назад к задаче: старый маршрут через начало потока уводил токен к старту.
    await panel.getByRole('button', { name: 'Предыдущий шаг' }).click();
    const closestToStart = await minTokenOffsetDuring(page, 'StartEvent_1', 700);
    expect(closestToStart).toBeGreaterThan(10);
    await expectTokenAt(page, 'Task_Review');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: выбор ветки не сбрасывает токен на начало', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation choice ${Date.now()}`, bpmn_xml: decisionXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Split"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    const choice = panel.getByRole('group', { name: 'Выбор ветки симуляции' });
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await expectTokenAt(page, 'Split');

    // Выбор ветки дописывает прогон с текущего шага: токен остаётся на шлюзе.
    await choice.getByRole('button', { name: /Нет/ }).click();
    await expect(panel.locator('.simulation-panel__current')).toContainText(/Шаг 2\/3/);
    await expectTokenAt(page, 'Split');
    await page.waitForTimeout(600);
    await expectTokenAt(page, 'Split');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

// Раскрытый подпроцесс: внутренние старт, задача и конец идут в журнал.
const subprocessXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn-studio.dev/test">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start" name="Старт"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:subProcess id="Sub" name="Проверка">
      <bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing>
      <bpmn:startEvent id="SubStart" name="Начало проверки"><bpmn:outgoing>SF1</bpmn:outgoing></bpmn:startEvent>
      <bpmn:task id="SubTask" name="Сверить"><bpmn:incoming>SF1</bpmn:incoming><bpmn:outgoing>SF2</bpmn:outgoing></bpmn:task>
      <bpmn:endEvent id="SubEnd" name="Конец проверки"><bpmn:incoming>SF2</bpmn:incoming></bpmn:endEvent>
      <bpmn:sequenceFlow id="SF1" sourceRef="SubStart" targetRef="SubTask" />
      <bpmn:sequenceFlow id="SF2" sourceRef="SubTask" targetRef="SubEnd" />
    </bpmn:subProcess>
    <bpmn:endEvent id="End" name="Готово"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Sub" />
    <bpmn:sequenceFlow id="F2" sourceRef="Sub" targetRef="End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dia"><bpmndi:BPMNPlane id="Plane" bpmnElement="P">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="100" y="140" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Sub_di" bpmnElement="Sub" isExpanded="true"><dc:Bounds x="200" y="100" width="420" height="220" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="SubStart_di" bpmnElement="SubStart"><dc:Bounds x="220" y="140" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="SubTask_di" bpmnElement="SubTask"><dc:Bounds x="300" y="118" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="SubEnd_di" bpmnElement="SubEnd"><dc:Bounds x="460" y="140" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="End_di" bpmnElement="End"><dc:Bounds x="700" y="140" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="136" y="158" /><di:waypoint x="200" y="158" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="SF1_di" bpmnElement="SF1"><di:waypoint x="256" y="158" /><di:waypoint x="300" y="158" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="SF2_di" bpmnElement="SF2"><di:waypoint x="400" y="158" /><di:waypoint x="460" y="158" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="620" y="158" /><di:waypoint x="700" y="158" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test('симуляция: раскрытый подпроцесс проходит внутренние шаги', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation subprocess ${Date.now()}`, bpmn_xml: subprocessXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Sub"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });

    // Старт → подпроцесс → внутренний старт → задача → конец → конец процесса.
    await expect(panel.getByRole('status')).toContainText('Завершено: 6 шагов');
    const steps = panel.locator('.simulation-panel__step');
    await expect(steps).toHaveCount(6);
    await expect(steps.nth(2)).toHaveText(/Начало проверки/);
    await expect(steps.nth(3)).toHaveText(/Сверить/);
    await expect(steps.nth(4)).toHaveText(/Конец проверки/);

    // Токен доходит до внутренней задачи и стоит на её геометрии.
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await expect(panel.locator('.simulation-panel__current')).toContainText('Сверить');
    await expectTokenAt(page, 'SubTask');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: прогон и тест-кейс переживают перезагрузку', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation library ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    await expect(panel.getByRole('status').first()).toContainText('Завершено');

    await panel.getByRole('button', { name: 'Сохранить прогон' }).click();
    await expect(panel.getByTestId('sim-run')).toHaveCount(1);

    await panel.getByLabel('Название тест-кейса').fill('Линейный');
    await panel.getByRole('button', { name: 'Сохранить как тест-кейс' }).click();
    const testCase = panel.getByTestId('sim-case').filter({ hasText: 'Линейный' });
    await expect(testCase).toBeVisible();
    await testCase.getByRole('button', { name: 'Запустить тест-кейс Линейный' }).click();
    await expect(panel.getByTestId('sim-case-result')).toContainText('Пройден');

    // Прогон и тест-кейс хранятся в БД: после перезагрузки они на месте.
    await page.reload();
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const reopened = page.getByRole('complementary', { name: 'Симуляция процесса' });
    await expect(reopened.getByTestId('sim-run')).toHaveCount(1);
    await expect(reopened.getByTestId('sim-case').filter({ hasText: 'Линейный' })).toBeVisible();
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

async function panelBoxes(page: Page) {
  const simulation = page.locator('.simulation-panel');
  const comments = page.locator('.comments-panel:not(.simulation-panel)');
  return { simulation: await simulation.boundingBox(), comments: await comments.boundingBox() };
}

test('симуляция: панели стоят друг под другом и перетаскиваются', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation panels ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    await expect(page.locator('.simulation-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Комментарии', exact: true }).click();

    // Ждём, пока обе панели получат размеры.
    await expect.poll(async () => (await panelBoxes(page)).comments !== null).toBe(true);
    const { simulation, comments } = await panelBoxes(page);
    expect(simulation).not.toBeNull();
    expect(comments).not.toBeNull();
    if (simulation && comments) {
      // Второе окно под первым, а не поверх него.
      expect(comments.y).toBeGreaterThanOrEqual(simulation.y + simulation.height - 1);
    }

    // Перетаскивание за заголовок сдвигает только эту панель.
    const originalX = simulation?.x ?? 0;
    const header = page.locator('.simulation-panel__header');
    const handle = await header.boundingBox();
    expect(handle).not.toBeNull();
    if (handle) {
      await page.mouse.move(handle.x + 30, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x - 250, handle.y + handle.height / 2 + 80, { steps: 12 });
      await page.mouse.up();
    }
    await expect
      .poll(async () => (await page.locator('.simulation-panel').boundingBox())?.x ?? 0)
      .toBeLessThan(originalX - 100);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: положение и размер панели сохраняются между открытиями', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation layout ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.locator('.simulation-panel');
    await expect(panel).toBeVisible();

    // Увеличиваем панель за правый нижний угол.
    const grip = await panel.locator('.comments-panel__resize').boundingBox();
    expect(grip).not.toBeNull();
    if (grip) {
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await page.mouse.move(grip.x + grip.width / 2 + 70, grip.y + grip.height / 2 + 50, {
        steps: 8,
      });
      await page.mouse.up();
    }

    // И сдвигаем её заголовком.
    const header = await panel.locator('.simulation-panel__header').boundingBox();
    expect(header).not.toBeNull();
    if (header) {
      await page.mouse.move(header.x + 30, header.y + header.height / 2);
      await page.mouse.down();
      await page.mouse.move(header.x - 90, header.y + header.height / 2 + 40, { steps: 8 });
      await page.mouse.up();
    }

    const before = await panel.boundingBox();
    expect(before).not.toBeNull();

    await panel.getByRole('button', { name: 'Закрыть' }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    await expect(page.locator('.simulation-panel')).toBeVisible();

    const after = await page.locator('.simulation-panel').boundingBox();
    expect(after).not.toBeNull();
    if (before && after) {
      expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(2);
    }
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: сдвинутая влево панель не обрезается обёрткой', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation clipping ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.locator('.simulation-panel');
    await expect(panel).toBeVisible();

    const header = await panel.locator('.simulation-panel__header').boundingBox();
    expect(header).not.toBeNull();
    if (header) {
      await page.mouse.move(header.x + 30, header.y + header.height / 2);
      await page.mouse.down();
      await page.mouse.move(header.x - 400, header.y + header.height / 2, { steps: 12 });
      await page.mouse.up();
    }

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // В центре панели должен быть сама панель, а не невидимая обёртка холста.
      const hitPanel = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('.simulation-panel') !== null,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(hitPanel).toBe(true);
    }
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: автоположение и двойной клик возвращают панель на место', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation auto layout ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="StartEvent_1"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.locator('.simulation-panel');
    await expect(panel).toBeVisible();
    const original = await panel.boundingBox();
    expect(original).not.toBeNull();

    const dragBy = async (dx: number, dy: number) => {
      const header = await panel.locator('.simulation-panel__header').boundingBox();
      expect(header).not.toBeNull();
      if (!header) {
        return;
      }
      await page.mouse.move(header.x + 30, header.y + header.height / 2);
      await page.mouse.down();
      await page.mouse.move(header.x + 30 + dx, header.y + header.height / 2 + dy, { steps: 8 });
      await page.mouse.up();
    };

    // Автоположение: окна возвращаются и встают в колонку без ручного сдвига.
    await dragBy(-160, 70);
    await expect
      .poll(async () => (await panel.boundingBox())?.x ?? 0)
      .toBeLessThan((original?.x ?? 0) - 100);
    const auto = page.getByLabel('Автоположение окон');
    await auto.check();
    await expect
      .poll(async () => (await panel.boundingBox())?.x ?? 0)
      .toBeCloseTo(original?.x ?? 0, 0);
    await expect(panel.locator('.comments-panel__resize')).toHaveCount(0);
    await auto.uncheck();

    // Двойной клик по заголовку сбрасывает и смещение, и свой размер.
    await dragBy(-160, 70);
    await panel.locator('.simulation-panel__header').dblclick({ position: { x: 30, y: 12 } });
    await expect
      .poll(async () => (await panel.boundingBox())?.x ?? 0)
      .toBeCloseTo(original?.x ?? 0, 0);
    await expect
      .poll(async () => (await panel.boundingBox())?.y ?? 0)
      .toBeCloseTo(original?.y ?? 0, 0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: переменные из панели выбирают ветку автоматически', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation variables ${Date.now()}`, bpmn_xml: decisionXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Split"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    // Без переменной прогон спрашивает ветку, с `ok = true` — идёт сам.
    await expect(panel.getByRole('group', { name: 'Выбор ветки симуляции' })).toBeVisible();
    await panel.locator('.simulation-panel__variables summary').click();
    await panel.getByLabel('Переменные симуляции').fill('ok = true');
    await panel.getByRole('button', { name: 'Перезапустить' }).click();

    await expect(panel.getByRole('status')).toContainText('Завершено: 3 шагов');
    await expect(panel.locator('.simulation-panel__log')).toContainText('Отказано');
    await expect(panel.getByRole('group', { name: 'Выбор ветки симуляции' })).toHaveCount(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: ветку без условия выбирают вручную', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E simulation decision ${Date.now()}`, bpmn_xml: decisionXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Split"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    const choice = panel.getByRole('group', { name: 'Выбор ветки симуляции' });
    await expect(choice).toBeVisible();
    await expect(choice).toContainText('Проверка');

    // Ручной выбор «Нет» доводит токен до отказа.
    await choice.getByRole('button', { name: /Нет/ }).click();
    await expect(panel.getByRole('status')).toContainText('Завершено: 3 шагов');
    await expect(panel.locator('.simulation-panel__log')).toContainText('Отказано');
    await expect(choice).toHaveCount(0);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: таймер ждёт свою длительность', async ({ page, request }) => {
  const timerXml = readFileSync('e2e/fixtures/timer.bpmn', 'utf8');
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E timer ${Date.now()}`, bpmn_xml: timerXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Wait_Timer"]').first()).toBeVisible();

    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    await expect(panel.getByRole('status')).toContainText('Завершено: 3 шагов');

    // Шаг таймера показывает выражение и держит токен на событии.
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await expect(panel.locator('.simulation-panel__current')).toContainText(
      'ожидание таймера: PT2S',
    );
    await expectTokenAt(page, 'Wait_Timer');

    // На скорости 2× ожидание PT2S — секунда: сразу шаг не перескакивает.
    await panel.getByLabel('Скорость').selectOption('2');
    await panel.getByRole('button', { name: 'Играть' }).click();
    await page.waitForTimeout(400);
    await expect(panel.locator('.simulation-panel__current')).toContainText('Пауза');
    await expect(panel.locator('.simulation-panel__current')).toContainText('Готово', {
      timeout: 3000,
    });
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: токен едет за перетащенным элементом', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E token drag ${Date.now()}`, bpmn_xml: sampleXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Task_Review"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await expectTokenAt(page, 'Task_Review');

    // После перетаскивания фигуры токен снимает новую геометрию, а не старую.
    const task = page.locator('[data-element-id="Task_Review"]').first();
    const box = await task.boundingBox();
    expect(box).toBeTruthy();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 50, { steps: 10 });
      await page.mouse.up();
    }
    await expectTokenAt(page, 'Task_Review');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});

test('симуляция: скрипт-задача меняет переменные, значения видны на шаге', async ({
  page,
  request,
}) => {
  const scriptXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn-studio.dev/test">
  <bpmn:process id="P" isExecutable="true">
    <bpmn:startEvent id="Start" name="Старт"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:scriptTask id="Prepare" name="Подготовить" scriptFormat="python"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing><bpmn:script>approved = 2 * 3 &gt; 5
note = 'готово'</bpmn:script></bpmn:scriptTask>
    <bpmn:endEvent id="End" name="Конец"><bpmn:incoming>F2</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Prepare" />
    <bpmn:sequenceFlow id="F2" sourceRef="Prepare" targetRef="End" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Dia"><bpmndi:BPMNPlane id="Plane" bpmnElement="P">
    <bpmndi:BPMNShape id="Start_di" bpmnElement="Start"><dc:Bounds x="100" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Prepare_di" bpmnElement="Prepare"><dc:Bounds x="190" y="78" width="100" height="80" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="End_di" bpmnElement="End"><dc:Bounds x="350" y="100" width="36" height="36" /></bpmndi:BPMNShape>
    <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="136" y="118" /><di:waypoint x="190" y="118" /></bpmndi:BPMNEdge>
    <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="290" y="118" /><di:waypoint x="350" y="118" /></bpmndi:BPMNEdge>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E script ${Date.now()}`, bpmn_xml: scriptXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Prepare"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Симуляция процесса' }).click();
    const panel = page.getByRole('complementary', { name: 'Симуляция процесса' });
    await expect(panel.getByRole('status')).toContainText('Завершено: 3 шагов');

    await panel.getByRole('button', { name: 'Следующий шаг' }).click();
    await expect(panel.locator('.simulation-panel__current')).toContainText('Подготовить');
    const state = panel.getByRole('list', { name: 'Переменные на шаге' });
    await expect(state).toContainText('approved');
    await expect(state).toContainText('true');
    await expect(state).toContainText('"готово"');
    await expect(panel.locator('.simulation-panel__state-item--changed')).toHaveCount(2);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
