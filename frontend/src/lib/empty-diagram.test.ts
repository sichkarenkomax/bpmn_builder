import { describe, expect, it } from 'vitest';

import { buildEmptyDiagram, escapeXml, TARGET_NAMESPACE } from './empty-diagram';

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

describe('buildEmptyDiagram', () => {
  it('содержит определения, процесс и плоскость BPMNDI', () => {
    const xml = buildEmptyDiagram();

    expect(xml).toContain('bpmn:definitions');
    expect(xml).toContain('bpmn:process id="Process_1"');
    expect(xml).toContain('bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1"');
    expect(xml).toContain(`targetNamespace="${TARGET_NAMESPACE}"`);
  });

  it('отдаёт корректный XML без ошибок парсинга', () => {
    const document = parse(buildEmptyDiagram());

    expect(document.querySelector('parsererror')).toBeNull();
    expect(document.documentElement.nodeName).toBe('bpmn:definitions');
  });

  it('экранирует имя процесса', () => {
    const document = parse(buildEmptyDiagram('Согласование <счёта> & оплата'));

    expect(document.querySelector('parsererror')).toBeNull();
    const process = document.getElementsByTagName('bpmn:process')[0];
    expect(process?.getAttribute('name')).toBe('Согласование <счёта> & оплата');
  });
});

describe('escapeXml', () => {
  it('заменяет все служебные символы', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;',
    );
  });
});
