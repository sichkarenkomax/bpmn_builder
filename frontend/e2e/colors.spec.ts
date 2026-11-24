import { expect, test } from '@playwright/test';

const API = '/api/v1';

const taskXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:bs="https://bpmn-studio.dev/schema/1.0" bs:theme="colored" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false"><bpmn:task id="Task_1" name="Задача" /></bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="200" y="200" width="100" height="80" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test('ручной цвет задачи не сбрасывается темой при добавлении пула', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E colors ${Date.now()}`, bpmn_xml: taskXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_1"]').first();
    await expect(task).toBeVisible();

    const taskBox = (await task.boundingBox())!;
    await page.mouse.click(taskBox.x + taskBox.width / 2, taskBox.y + taskBox.height / 2);
    await page.getByLabel('Заливка', { exact: true }).first().fill('#22c55e');
    await expect
      .poll(() => task.evaluate((el) => getComputedStyle(el.querySelector('rect')!).fill))
      .toBe('rgb(34, 197, 94)');

    await page.locator('.djs-palette [data-action="create.participant-expanded"]').click();
    await page.mouse.click(500, 400);
    await expect(page.locator('[data-element-id^="Participant_"]')).toHaveCount(1);

    await expect
      .poll(() => task.evaluate((el) => getComputedStyle(el.querySelector('rect')!).fill))
      .toBe('rgb(34, 197, 94)');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
