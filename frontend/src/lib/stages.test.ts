import { describe, expect, it } from 'vitest';

import {
  collectStagePools,
  createStage,
  hiddenStageElementIds,
  parseStages,
  POOL_LABEL_WIDTH,
  resizeStageBoundary,
  serializeStages,
  stageBounds,
  stageContentRight,
  stageForPool,
  stagesEnabled,
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

describe('этапы схемы', () => {
  it('переживают запись и чтение JSON-атрибута', () => {
    const stages: DiagramStage[] = [
      {
        id: 's1',
        name: 'Согласование',
        poolId: 'Pool_1',
        x: POOL_LABEL_WIDTH,
        collapsed: false,
      },
    ];
    const raw = serializeStages(stages);

    expect(raw).toContain('Согласование');
    expect(raw).toContain('Pool_1');
    expect(raw).not.toContain('milestones');
    expect(raw).not.toContain('width');
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
        ]),
      ),
    ).toEqual([
      {
        id: 'ok',
        name: 'Этап',
        poolId: 'Pool_1',
        x: 10,
        collapsed: true,
      },
    ]);
  });

  it('старый горизонтальный формат переносится в начало основной части пула', () => {
    expect(
      parseStages(
        JSON.stringify([
          {
            id: 'old',
            name: 'Старый этап',
            y: 300,
            height: 180,
            collapsed: false,
          },
        ]),
      ),
    ).toEqual([
      {
        id: 'old',
        name: 'Старый этап',
        poolId: '__process__',
        x: POOL_LABEL_WIDTH,
        collapsed: false,
      },
    ]);
  });

  it('первый этап занимает основную часть пула, следующий добавляется справа', () => {
    const first = createStage([], pool);
    expect(first.poolId).toBe('Pool_1');
    expect(first.x).toBe(POOL_LABEL_WIDTH);
    expect(first.name).toBe('Этап 1');

    const second = createStage([first], pool);
    expect(second.x).toBe(pool.width);
    expect(second.name).toBe('Этап 2');
    expect(STAGE_DEFAULT_WIDTH).toBe(260);
  });

  it('границы этапов идут до следующего этапа или до края пула', () => {
    const first: DiagramStage = {
      id: 's1',
      name: 'Первый',
      poolId: 'Pool_1',
      x: POOL_LABEL_WIDTH,
      collapsed: false,
    };
    const second: DiagramStage = {
      id: 's2',
      name: 'Второй',
      poolId: 'Pool_1',
      x: 500,
      collapsed: false,
    };

    expect(stageBounds(first, [pool], [first, second])).toEqual({
      x: 190,
      y: 60,
      width: 470,
      height: 240,
    });
    expect(stageBounds(second, [pool], [first, second])).toEqual({
      x: 660,
      y: 60,
      width: 100,
      height: 240,
    });
    expect(stageBounds(first, [pool], [first])).toEqual({
      x: 190,
      y: 60,
      width: 570,
      height: 240,
    });
    expect(stageBounds({ ...first, poolId: 'missing' }, [pool], [first])).toBeUndefined();
  });

  it('перетаскивание границы сдвигает следующие этапы и край пула', () => {
    const stages: DiagramStage[] = [
      { id: 's1', name: 'Первый', poolId: 'Pool_1', x: POOL_LABEL_WIDTH, collapsed: false },
      { id: 's2', name: 'Второй', poolId: 'Pool_1', x: 300, collapsed: false },
      { id: 's3', name: 'Третий', poolId: 'Pool_1', x: 500, collapsed: false },
    ];

    const widened = resizeStageBoundary(stages, pool, 's1', 100);
    expect(widened.delta).toBe(100);
    expect(widened.poolWidth).toBe(700);
    expect(widened.stages.map((stage) => stage.x)).toEqual([30, 400, 600]);

    const narrowed = resizeStageBoundary(stages, { ...pool, width: 700 }, 's3', -100);
    expect(narrowed.delta).toBe(-100);
    expect(narrowed.poolWidth).toBe(600);
    expect(narrowed.stages.map((stage) => stage.x)).toEqual([30, 300, 500]);
  });

  it('граница не сжимает этап меньше минимальной ширины', () => {
    const stages: DiagramStage[] = [
      { id: 's1', name: 'Первый', poolId: 'Pool_1', x: 30, collapsed: false },
      { id: 's2', name: 'Второй', poolId: 'Pool_1', x: 200, collapsed: false },
    ];

    const result = resizeStageBoundary(stages, { ...pool, width: 300 }, 's1', -200);
    expect(result.delta).toBe(-70);
    expect(result.poolWidth).toBe(230);
    expect(result.stages[1]!.x).toBe(130);

    const alreadyNarrow: DiagramStage[] = [
      { ...stages[0]!, x: 30 },
      { ...stages[1]!, x: 100 },
    ];
    expect(resizeStageBoundary(alreadyNarrow, pool, 's1', -50).delta).toBe(0);
  });

  it('находит правую границу содержимого этапа', () => {
    const stages: DiagramStage[] = [
      { id: 's1', name: 'Первый', poolId: 'Pool_1', x: 30, collapsed: false },
      { id: 's2', name: 'Второй', poolId: 'Pool_1', x: 400, collapsed: false },
    ];
    const elements = [
      { id: 'Pool_1', type: 'bpmn:Participant', x: 160, y: 60, width: 600, height: 240 },
      { id: 'Task', type: 'bpmn:Task', x: 300, y: 100, width: 100, height: 80 },
      { id: 'Outside', type: 'bpmn:Task', x: 800, y: 100, width: 100, height: 80 },
      { id: 'Label', type: 'label', x: 300, y: 100, width: 50, height: 20 },
    ];

    expect(stageContentRight(stages[0]!, elements, [pool], stages)).toBe(400);
    expect(stageContentRight(stages[1]!, elements, [pool], stages)).toBeUndefined();
  });

  it('этапы одного пула сортируются по границе', () => {
    const stages: DiagramStage[] = [
      { id: 's2', name: 'Второй', poolId: 'Pool_1', x: 400, collapsed: false },
      { id: 's1', name: 'Первый', poolId: 'Pool_1', x: 30, collapsed: false },
    ];

    expect(stageForPool(stages, 'Pool_1').map((stage) => stage.id)).toEqual(['s1', 's2']);
    expect(stagesEnabled(stages, 'Pool_1')).toBe(true);
    expect(stagesEnabled(stages, 'Pool_2')).toBe(false);
  });

  it('свёрнутый этап скрывает фигуры внутри своей вертикальной фазы', () => {
    const stages: DiagramStage[] = [
      {
        id: 's1',
        name: 'Этап',
        poolId: 'Pool_1',
        x: 100,
        collapsed: true,
      },
      {
        id: 's2',
        name: 'Следующий',
        poolId: 'Pool_1',
        x: 300,
        collapsed: false,
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
      // Правее следующей границы.
      { id: 'Right', type: 'bpmn:Task', x: 600, y: 100, width: 100, height: 80 },
      { id: 'Lane', type: 'bpmn:Lane', x: 190, y: 60, width: 570, height: 120 },
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
            x: POOL_LABEL_WIDTH,
            collapsed: false,
          },
        ],
        [
          { id: 'Pool_1', type: 'bpmn:Participant', x: 0, y: 0, width: 600, height: 240 },
          { id: 'Task', type: 'bpmn:Task', x: 60, y: 10, width: 100, height: 80 },
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
