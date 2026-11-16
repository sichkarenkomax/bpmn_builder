import { describe, expect, it } from 'vitest';

import {
  createMilestone,
  createStage,
  hiddenStageElementIds,
  parseStages,
  serializeStages,
  STAGE_DEFAULT_HEIGHT,
  type DiagramStage,
} from './stages';

describe('этапы схемы (1.3.14)', () => {
  it('переживают запись и чтение JSON-атрибута', () => {
    const stages: DiagramStage[] = [
      { id: 's1', name: 'Согласование', y: 40, height: 180, collapsed: false, milestones: [] },
    ];
    const raw = serializeStages(stages);

    expect(raw).toContain('Согласование');
    expect(parseStages(raw)).toEqual(stages);
    expect(serializeStages([])).toBeUndefined();
  });

  it('битый атрибут не ломает открытие, а неверные записи отбрасываются', () => {
    expect(parseStages('{')).toBeNull();
    expect(parseStages('{"a":1}')).toBeNull();
    expect(
      parseStages(
        JSON.stringify([
          {
            id: 'ok',
            name: 'Этап',
            y: 10,
            height: 200,
            collapsed: true,
            milestones: [{ id: 'm1', name: 'Согласовано', x: 300 }],
          },
          { id: 'bad', name: 'Без координат', height: 100 },
          { id: 'bad-height', name: 'Низкий', y: 400, height: 10 },
        ]),
      ),
    ).toEqual([
      {
        id: 'ok',
        name: 'Этап',
        y: 10,
        height: 200,
        collapsed: true,
        milestones: [{ id: 'm1', name: 'Согласовано', x: 300 }],
      },
      // Слишком маленькая высота поднимается до минимума, запись без координат — отбрасывается.
      { id: 'bad-height', name: 'Низкий', y: 400, height: 60, collapsed: false, milestones: [] },
    ]);
  });

  it('новый этап встаёт ниже существующих', () => {
    const stage = createStage([
      { id: 's1', name: 'Первый', y: 20, height: STAGE_DEFAULT_HEIGHT, collapsed: false, milestones: [] },
    ]);

    expect(stage.y).toBe(20 + STAGE_DEFAULT_HEIGHT + 24);
    expect(stage.name).toBe('Этап 2');
    expect(stage.height).toBe(STAGE_DEFAULT_HEIGHT);
    expect(stage.milestones).toEqual([]);
  });

  it('вехи переживают запись и чтение', () => {
    const stages: DiagramStage[] = [
      {
        id: 's1',
        name: 'Этап',
        y: 0,
        height: 200,
        collapsed: false,
        milestones: [{ id: 'm1', name: 'Согласовано', x: 280 }],
      },
    ];

    expect(parseStages(serializeStages(stages))).toEqual(stages);
    expect(createMilestone(stages[0]!, 1)).toMatchObject({ name: 'Веха 2', x: 280 });
  });

  it('свёрнутый этап скрывает фигуры внутри и связи между ними', () => {
    const stages: DiagramStage[] = [
      { id: 's1', name: 'Этап', y: 0, height: 200, collapsed: true, milestones: [] },
    ];
    const elements = [
      { id: 'Start', type: 'bpmn:StartEvent', x: 100, y: 80, width: 36, height: 36 },
      { id: 'Task', type: 'bpmn:Task', x: 200, y: 80, width: 100, height: 80 },
      {
        id: 'Flow',
        type: 'bpmn:SequenceFlow',
        source: { id: 'Start' },
        target: { id: 'Task' },
      },
      { id: 'Outside', type: 'bpmn:Task', x: 200, y: 400, width: 100, height: 80 },
      { id: 'Pool', type: 'bpmn:Participant', x: 0, y: 20, width: 800, height: 300 },
      { id: 'Label', type: 'label', x: 200, y: 80, width: 50, height: 20, labelTarget: { id: 'Task' } },
    ];

    expect([...hiddenStageElementIds(stages, elements)].sort()).toEqual([
      'Flow',
      'Label',
      'Start',
      'Task',
    ]);
  });

  it('развёрнутый этап ничего не скрывает', () => {
    expect(
      hiddenStageElementIds(
        [{ id: 's1', name: 'Этап', y: 0, height: 200, collapsed: false, milestones: [] }],
        [{ id: 'Task', type: 'bpmn:Task', x: 10, y: 10, width: 100, height: 80 }],
      ).size,
    ).toBe(0);
  });
});
