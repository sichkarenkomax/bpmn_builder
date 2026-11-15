export const TARGET_NAMESPACE = 'http://bpmn-studio.dev/schema';

/**
 * Пустая диаграмма: определения + плоскость BPMNDI без элементов.
 * Именно такой документ bpmn-js открывает как «чистый лист» и корректно сериализует обратно.
 */
export function buildEmptyDiagram(processName = 'Новый процесс'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1"
                  targetNamespace="${TARGET_NAMESPACE}">
  <bpmn:process id="Process_1" name="${escapeXml(processName)}" isExecutable="false" />
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
