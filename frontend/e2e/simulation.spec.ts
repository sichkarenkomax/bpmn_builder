import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const sampleXml = readFileSync(resolve(here, 'fixtures/pool.bpmn'), 'utf8');
const API = '/api/v1';

/** Токен должен стоять по центру элемента, а не на конце входящего потока. */
async function expectTokenAt(page: Page, elementId: string) {
  const token = page.getByTestId('sim-tokens').locator('.sim-token').first();
  await expect
    .poll(
      async () => {
        const tokenBox = await token.boundingBox();
        const elementBox = await page
          .locator(`[data-element-id="${elementId}"]`)
          .first()
          .boundingBox();
        if (!tokenBox || !elementBox) {
          return Number.POSITIVE_INFINITY;
        }
        const dx = tokenBox.x + tokenBox.width / 2 - (elementBox.x + elementBox.width / 2);
        const dy = tokenBox.y + tokenBox.height / 2 - (elementBox.y + elementBox.height / 2);
        return Math.max(Math.abs(dx), Math.abs(dy));
      },
      { timeout: 3000 },
    )
    .toBeLessThan(8);
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
