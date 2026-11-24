import { expect, test } from '@playwright/test';

const API = '/api/v1';

/**
 * Два пула перекрываются. Фон верхнего пула не должен закрывать задачу
 * нижнего: все фоны вынесены в отдельный нижний слой.
 */
const overlappingPoolsXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Pool_A" processRef="Process_A" />
    <bpmn:participant id="Pool_B" processRef="Process_B" />
  </bpmn:collaboration>
  <bpmn:process id="Process_A" isExecutable="false"><bpmn:task id="Task_A" /></bpmn:process>
  <bpmn:process id="Process_B" isExecutable="false"><bpmn:task id="Task_B" /></bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Pool_A_di" bpmnElement="Pool_A" isHorizontal="true">
        <dc:Bounds x="100" y="100" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="450" y="180" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Pool_B_di" bpmnElement="Pool_B" isHorizontal="true">
        <dc:Bounds x="400" y="150" width="600" height="250" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="800" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

test('перекрывающийся пул не закрывает задачу другого пула', async ({ page, request }) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E pools ${Date.now()}`, bpmn_xml: overlappingPoolsXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    const task = page.locator('[data-element-id="Task_A"]').first();
    await expect(task).toBeVisible();

    // Все фоны пулов лежат в отдельном нижнем слое, а фон Pool_B больше не
    // перекрывает задачу Task_A.
    expect(
      await page.evaluate(() => {
        const layer = document.querySelector('[class^="layer-root-"]');
        return layer?.firstElementChild?.classList.contains('djs-frame-backgrounds') ?? false;
      }),
    ).toBe(true);
    expect(
      await page.evaluate(() => {
        const layer = document.querySelector('[class^="layer-root-"]')!;
        const backgrounds = layer.querySelector('.djs-frame-backgrounds')!;
        const task = document.querySelector('[data-element-id="Task_A"]')!;
        const taskGroup = task.closest('.djs-group')!;
        const poolBackground = document.querySelector(
          '[data-element-id="Pool_B"] .djs-visual > rect',
        ) as SVGElement;
        return {
          poolBackgroundHidden: getComputedStyle(poolBackground).visibility === 'hidden',
          taskAfterBackground:
            (backgrounds.compareDocumentPosition(taskGroup) & Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
        };
      }),
    ).toEqual({ poolBackgroundHidden: true, taskAfterBackground: true });
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
