import { BpmnModdle } from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';

import bsModdle from './bs-moddle.json';
import { readDiagramSettings, type DefinitionsLike } from './diagram-settings';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    <bpmn:task id="Task_1" name="Задача" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function parse(source = XML) {
  const moddle = new BpmnModdle({ bs: bsModdle });
  const { rootElement } = await moddle.fromXML(source);
  const shape = rootElement.diagrams[0]?.plane.planeElement[0];
  if (!shape) {
    throw new Error('shape not found');
  }
  return { moddle, rootElement, shape };
}

describe('bs namespace', () => {
  it('объявляет xmlns:bs и сохраняет bs-атрибуты DI', async () => {
    const { moddle, rootElement, shape } = await parse();
    shape.$attrs['bs:font-size'] = '18';
    shape.$attrs['bs:opacity'] = '0.6';
    shape.$attrs['bs:stroke-style'] = 'dashed';

    const result = await moddle.toXML(rootElement, { format: true });

    expect(result.xml).toContain('xmlns:bs="https://bpmn-studio.dev/schema/1.0"');
    expect(result.xml).toContain('bs:font-size="18"');
    expect(result.xml).toContain('bs:opacity="0.6"');
    expect(result.xml).toContain('bs:stroke-style="dashed"');
  });

  it('читает bs-атрибуты из чужого XML', async () => {
    const source = XML.replace(
      'bpmnElement="Task_1"',
      'bpmnElement="Task_1" bs:font-size="14" bs:font-bold="true"',
    ).replace('xmlns:dc=', 'xmlns:bs="https://bpmn-studio.dev/schema/1.0" xmlns:dc=');
    const { shape } = await parse(source);

    expect(shape.$attrs['bs:font-size']).toBe('14');
    expect(shape.$attrs['bs:font-bold']).toBe('true');
  });

  it('хранит тему и позицию легенды в $attrs на bpmn:definitions', async () => {
    const { moddle, rootElement } = await parse();
    rootElement.$attrs['bs:theme'] = 'classic';
    rootElement.$attrs['bs:legend-x'] = '200';
    rootElement.$attrs['bs:legend-y'] = '40';

    const result = await moddle.toXML(rootElement, { format: true });

    // Корневой тег должен остаться строчным, иначе XSD отвергает документ.
    expect(result.xml).toContain('<bpmn:definitions');
    expect(result.xml).toContain('<bpmndi:BPMNShape');
    expect(result.xml).toContain('bs:theme="classic"');
    expect(result.xml).toContain('bs:legend-x="200"');
    expect(result.xml).toContain('bs:legend-y="40"');

    const reloaded = await parse(result.xml);
    const settings = readDiagramSettings(reloaded.rootElement as unknown as DefinitionsLike);
    expect(settings.theme).toBe('classic');
    expect(settings.legend).toEqual({ x: 200, y: 40 });
  });
});
