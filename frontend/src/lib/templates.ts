import { buildEmptyDiagram, escapeXml, TARGET_NAMESPACE } from './empty-diagram';

export type TemplateId = 'empty' | 'approval' | 'onboarding' | 'procurement';

export interface DiagramTemplate {
  id: TemplateId;
  title: string;
  description: string;
  build: () => string;
}

/** Линейный процесс: старт → задачи → конец, с готовой BPMNDI-геометрией. */
export function buildLinearDiagram(name: string, steps: string[]): string {
  const taskXml: string[] = [];
  const flowXml: string[] = [];
  const shapeXml: string[] = [];
  const edgeXml: string[] = [];

  const startY = 160;
  const startX = 160;
  const centerY = 178;
  const taskY = 138;
  const taskWidth = 120;
  const taskHeight = 80;
  const gap = 60;
  const startWidth = 36;

  shapeXml.push(
    `      <bpmndi:BPMNShape id="Start_di" bpmnElement="Start">\n        <dc:Bounds x="${startX}" y="${startY}" width="${startWidth}" height="36"/>\n      </bpmndi:BPMNShape>`,
  );

  let previous = 'Start';
  let previousRight = startX + startWidth;
  steps.forEach((step, index) => {
    const id = `Task_${index + 1}`;
    const x = startX + startWidth + gap + index * (taskWidth + gap);
    taskXml.push(`    <bpmn:userTask id="${id}" name="${escapeXml(step)}"/>`);
    flowXml.push(
      `    <bpmn:sequenceFlow id="Flow_${index + 1}" sourceRef="${previous}" targetRef="${id}"/>`,
    );
    shapeXml.push(
      `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}">\n        <dc:Bounds x="${x}" y="${taskY}" width="${taskWidth}" height="${taskHeight}"/>\n      </bpmndi:BPMNShape>`,
    );
    edgeXml.push(
      `      <bpmndi:BPMNEdge id="Flow_${index + 1}_di" bpmnElement="Flow_${index + 1}">\n        <di:waypoint x="${previousRight}" y="${centerY}"/>\n        <di:waypoint x="${x}" y="${centerY}"/>\n      </bpmndi:BPMNEdge>`,
    );
    previous = id;
    previousRight = x + taskWidth;
  });

  const endX = previousRight + gap;
  const endId = 'End';
  flowXml.push(
    `    <bpmn:sequenceFlow id="Flow_${steps.length + 1}" sourceRef="${previous}" targetRef="${endId}"/>`,
  );
  shapeXml.push(
    `      <bpmndi:BPMNShape id="End_di" bpmnElement="End">\n        <dc:Bounds x="${endX}" y="${startY}" width="36" height="36"/>\n      </bpmndi:BPMNShape>`,
  );
  edgeXml.push(
    `      <bpmndi:BPMNEdge id="Flow_${steps.length + 1}_di" bpmnElement="Flow_${steps.length + 1}">\n        <di:waypoint x="${previousRight}" y="${centerY}"/>\n        <di:waypoint x="${endX}" y="${centerY}"/>\n      </bpmndi:BPMNEdge>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="${TARGET_NAMESPACE}">
  <bpmn:process id="Process_1" name="${escapeXml(name)}" isExecutable="false">
    <bpmn:startEvent id="Start" name="${escapeXml(name)}"/>
${taskXml.join('\n')}
    <bpmn:endEvent id="End" name="Завершено"/>
${flowXml.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
${shapeXml.join('\n')}
${edgeXml.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'empty',
    title: 'Пустой процесс',
    description: 'Чистый холст без элементов',
    build: () => buildEmptyDiagram('Новый процесс'),
  },
  {
    id: 'approval',
    title: 'Согласование',
    description: 'Заявка, проверка, решение и уведомление',
    build: () =>
      buildLinearDiagram('Согласование', [
        'Создать заявку',
        'Проверить заявку',
        'Согласовать',
        'Уведомить заявителя',
      ]),
  },
  {
    id: 'onboarding',
    title: 'Онбординг',
    description: 'Выход сотрудника: документы, доступы, обучение',
    build: () =>
      buildLinearDiagram('Онбординг сотрудника', [
        'Подготовить документы',
        'Выдать доступы',
        'Провести обучение',
        'Назначить наставника',
      ]),
  },
  {
    id: 'procurement',
    title: 'Закупка',
    description: 'Заявка, выбор поставщика, договор и приёмка',
    build: () =>
      buildLinearDiagram('Закупка', [
        'Собрать потребность',
        'Выбрать поставщика',
        'Заключить договор',
        'Принять поставку',
      ]),
  },
];
