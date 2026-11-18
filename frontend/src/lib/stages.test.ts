import { describe, expect, it } from 'vitest';

import {
  collectStagePools,
  createMilestone,
  createStage,
  hiddenStageElementIds,
  parseStages,
  serializeStages,
  stageBounds,
  STAGE_DEFAULT_WIDTH,
  type DiagramStage,
  type StagePool,
} from './stages';

const pool: StagePool = {
  id: 'Pool_1',
  name: 'Обработка заявки',
  x: 160,
  y: 60,
  width: 600,
  height: 240,
};

describe('этапы схемы (1.3.14)', () => {
  it('переживают запись и чтение JSON-атрибута', () => {
    const stages: DiagramStage[] = [
      {
        id: 's1',
        name: 'Согласование',
        poolId: 'Pool_1',
        x: 20,
        width: 260,
        collapsed: false,
        milestones: [],
      },
    ];
    const raw = serializeStages(stages);

    expect(raw).toContain('Согласование');
    expect(raw).toContain('Pool_1');
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
            poolId: 'Pool_1',
            x: 10,
            width: 200,
            collapsed: true,
            milestones: [{ id: 'm1', name: 'Согласовано', y: 80 }],
          },
          { id: 'bad', name: 'Без координат', width: 100 },
          { id: 'bad-width', name: 'Узкий', poolId: 'Pool_1', x: 0, width: 10 },
        ]),
      ),
    ).toEqual([
      {
        id: 'ok',
        name: 'Этап',
        poolId: 'Pool_1',
        x: 10,
        width: 200,
        collapsed: true,
        milestones: [{ id: 'm1', name: 'Согласовано', y: 80 }],
      },
      // Слишком маленькая ширина поднимается до минимума, запись без координат — отбрасывается.
      {
        id: 'bad-width',
        name: 'Узкий',
        poolId: 'Pool_1',
        x: 0,
        width: 100,
        collapsed: false,
        milestones: [],
      },
    ]);
  });

  it('старый горизонтальный формат переносится в процесс без потери названий', () => {
    expect(
      parseStages(
        JSON.stringify([
          {
            id: 'old',
            name: 'Старый этап',
            y: 300,
            height: 180,
            collapsed: false,
            milestones: [{ id: 'm1', name: 'Веха', x: 120 }],
          },
        ]),
      ),
    ).toEqual([
      {
        id: 'old',
        name: 'Старый этап',
        poolId: '__process__',
        x: 0,
        width: STAGE_DEFAULT_WIDTH,
        collapsed: false,
        milestones: [{ id: 'm1', name: 'Веха', y: 120 }],
      },
    ]);
  });

  it('новый этап встаёт справа внутри выбранного пула', () => {
    const stage = createStage(
      [
        {
          id: 's1',
          name: 'Первый',
          poolId: 'Pool_1',
          x: 12,
          width: 200,
          collapsed: false,
          milestones: [],
        },
      ],
      pool,
    );

    expect(stage.poolId).toBe('Pool_1');
    expect(stage.x).toBe(212);
    expect(stage.width).toBe(STAGE_DEFAULT_WIDTH);
    expect(stage.name).toBe('Этап 2');
    expect(stage.milestones).toEqual([]);
  });

  it('вехи переживают запись и чтение', () => {
    const stages: DiagramStage[] = [
      {
        id: 's1',
        name: 'Этап',
        poolId: 'Pool_1',
        x: 0,
        width: 200,
        collapsed: false,
        milestones: [{ id: 'm1', name: 'Согласовано', y: 80 }],
      },
    ];

    expect(parseStages(serializeStages(stages))).toEqual(stages);
    expect(createMilestone(stages[0]!, 1)).toMatchObject({ name: 'Веха 2', y: 170 });
  });

  it('этап ограничивается границами своего пула', () => {
    const stage: DiagramStage = {
      id: 's1',
      name: 'Этап',
      poolId: 'Pool_1',
      x: 500,
      width: 260,
      collapsed: false,
      milestones: [],
    };

    expect(stageBounds(stage, [pool])).toEqual({
      x: 660,
      y: 60,
      width: 100,
      height: 240,
    });
    expect(stageBounds({ ...stage, poolId: 'missing' }, [pool])).toBeUndefined();
  });

  it('свёрнутый этап скрывает фигуры внутри своей вертикальной фазы', () => {
    const stages: DiagramStage[] = [
      {
        id: 's1',
        name: 'Этап',
        poolId: 'Pool_1',
        x: 100,
        width: 200,
        collapsed: true,
        milestones: [],
      },
    ];
    const elements = [
      { id: 'Pool_1', type: 'bpmn:Participant', x: 160, y: 60, width: 600, height: 240 },
      { id: 'Start', type: 'bpmn:StartEvent', x: 280, y: 120, width: 36, height: 36 },
      { id: 'Task', type: 'bpmn:Task', x: 360, y: 100, width: 100, height: 80 },
      {
        id: 'Flow',
        type: 'bpmn:SequenceFlow',
        source: { id: 'Start' },
        target: { id: 'Task' },
      },
      // Левее этапа, но внутри пула.
      { id: 'Outside', type: 'bpmn:Task', x: 180, y: 100, width: 60, height: 80 },
      // В другой колонке того же пула.
      { id: 'Right', type: 'bpmn:Task', x: 600, y: 100, width: 100, height: 80 },
      { id: 'Lane', type: 'bpmn:Lane', x: 160, y: 60, width: 600, height: 120 },
      {
        id: 'Label',
        type: 'label',
        x: 360,
        y: 100,
        width: 50,
        height: 20,
        labelTarget: { id: 'Task' },
      },
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
        [
          {
            id: 's1',
            name: 'Этап',
            poolId: 'Pool_1',
            x: 0,
            width: 200,
            collapsed: false,
            milestones: [],
          },
        ],
        [
          { id: 'Pool_1', type: 'bpmn:Participant', x: 0, y: 0, width: 600, height: 240 },
          { id: 'Task', type: 'bpmn:Task', x: 10, y: 10, width: 100, height: 80 },
        ],
      ).size,
    ).toBe(0);
  });
});

describe('пулы этапов', () => {
  it('берёт bpmn:Participant и его имя', () => {
    expect(
      collectStagePools([
        {
          id: 'Pool_1',
          type: 'bpmn:Participant',
          x: 160,
          y: 60,
          width: 600,
          height: 240,
          businessObject: { name: 'Обработка заявки' },
        },
      ]),
    ).toEqual([pool]);
  });

  it('без пула строит синтетический контейнер по фигурам процесса', () => {
    const pools = collectStagePools([
      { id: 'Start', type: 'bpmn:StartEvent', x: 179, y: 99, width: 36, height: 36 },
      { id: 'Task', type: 'bpmn:Task', x: 270, y: 77, width: 100, height: 80 },
      { id: 'Flow', type: 'bpmn:SequenceFlow', source: { id: 'Start' }, target: { id: 'Task' } },
    ]);

    expect(pools).toEqual([
      {
        id: '__process__',
        name: 'Процесс',
        x: 155,
        y: 53,
        width: 239,
        height: 128,
        synthetic: true,
      },
    ]);
  });
});
