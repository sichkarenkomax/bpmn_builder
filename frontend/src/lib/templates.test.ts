import { describe, expect, it } from 'vitest';

import { buildLinearDiagram, DIAGRAM_TEMPLATES } from './templates';

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

describe('DIAGRAM_TEMPLATES', () => {
  it('все шаблоны — корректный XML с процессом и плоскостью', () => {
    for (const template of DIAGRAM_TEMPLATES) {
      const document = parse(template.build());
      expect(document.querySelector('parsererror')).toBeNull();
      expect(document.getElementsByTagName('bpmn:process')).toHaveLength(1);
      expect(document.getElementsByTagName('bpmndi:BPMNPlane')).toHaveLength(1);
    }
  });

  it('линейный шаблон создаёт старт, задачи, конец и связи', () => {
    const document = parse(buildLinearDiagram('Проверка', ['Раз', 'Два']));

    expect(document.getElementsByTagName('bpmn:userTask')).toHaveLength(2);
    expect(document.getElementsByTagName('bpmn:startEvent')).toHaveLength(1);
    expect(document.getElementsByTagName('bpmn:endEvent')).toHaveLength(1);
    expect(document.getElementsByTagName('bpmn:sequenceFlow')).toHaveLength(3);
    expect(document.getElementsByTagName('bpmndi:BPMNEdge')).toHaveLength(3);
  });

  it('экранирует имя процесса', () => {
    const document = parse(buildLinearDiagram('A & B < C', ['Шаг']));

    expect(document.getElementsByTagName('bpmn:process')[0]?.getAttribute('name')).toBe(
      'A & B < C',
    );
  });
});
