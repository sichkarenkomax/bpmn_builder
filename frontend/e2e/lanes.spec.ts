import { expect, test, type Page } from '@playwright/test';

const API = '/api/v1';

/**
 * Bizagi отдаёт дорожку, начинающуюся в координатах пула: её полоса названия
 * наезжает на заголовок участника. При открытии дорожка сдвигается за
 * заголовок, а длинное название снова переносится на несколько строк.
 */
const lanesXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_1" processRef="Process_1" />
  </bpmn:collaboration>
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:laneSet id="LaneSet_1">
      <bpmn:lane id="Lane_A" name="Клиентский отдел продаж и сопровождения">
        <bpmn:flowNodeRef>StartEvent_1</bpmn:flowNodeRef>
      </bpmn:lane>
    </bpmn:laneSet>
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">
        <dc:Bounds x="100" y="100" width="700" height="140" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Lane_A_di" bpmnElement="Lane_A" isHorizontal="true">
        <dc:Bounds x="100" y="100" width="700" height="140" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="152" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function readLane(page: Page) {
  return page.evaluate(() => {
    const lane = document.querySelector('[data-element-id="Lane_A"]');
    const label = lane?.querySelector('.djs-label');
    const rect = lane?.querySelector('.djs-visual > rect');
    return {
      transform: lane?.getAttribute('transform') ?? null,
      width: rect ? Number(rect.getAttribute('width')) : null,
      tspans: [...(label?.querySelectorAll('tspan') ?? [])].map((tspan) => tspan.textContent),
      title: label?.querySelector('title')?.textContent ?? null,
    };
  });
}

test('дорожка из Bizagi начинается после заголовка пула, а название переносится', async ({
  page,
  request,
}) => {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E lanes ${Date.now()}`, bpmn_xml: lanesXml },
  });
  expect(created.ok()).toBeTruthy();
  const diagram = (await created.json()) as { id: string };

  try {
    await page.goto(`/d/${diagram.id}`);
    await expect(page.locator('[data-element-id="Lane_A"]').first()).toBeVisible();

    const lane = await readLane(page);
    // Заголовок пула занимает 30 px: дорожка сдвинулась с x=100 на x=130,
    // сохранив правый край (700 → 670).
    expect(lane.transform).toMatch(/^(translate\(130[ ,]100\)|matrix\(1 0 0 1 130 100\))$/);
    expect(lane.width).toBe(670);

    // Штатный перенос bpmn-js: две строки без многоточия и без подсказки.
    expect(lane.tspans.length).toBeGreaterThan(1);
    expect(lane.tspans.join(' ')).not.toContain('…');
    expect(lane.title).toBeNull();

    // Исправленная геометрия сохраняется в XML, поэтому повторное открытие
    // не сдвигает дорожку ещё раз.
    await expect
      .poll(
        async () => {
          const response = await request.get(`${API}/diagrams/${diagram.id}/bpmn`);
          const xml = response.ok() ? await response.text() : '';
          return (
            xml.match(
              /<bpmndi:BPMNShape[^>]*bpmnElement="Lane_A"[\s\S]*?<dc:Bounds x="([\d.]+)"/,
            )?.[1] ?? ''
          );
        },
        { timeout: 8000 },
      )
      .toBe('130');

    await page.reload();
    await expect(page.locator('[data-element-id="Lane_A"]').first()).toBeVisible();
    const reloaded = await readLane(page);
    expect(reloaded.transform).toMatch(/^(translate\(130[ ,]100\)|matrix\(1 0 0 1 130 100\))$/);
    expect(reloaded.width).toBe(670);
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
