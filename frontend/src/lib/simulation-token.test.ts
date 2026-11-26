import { describe, expect, it } from 'vitest';

import { centerOf, latestTokenSteps, pointAlong, tokenRoute } from './simulation-token';

describe('simulation-token', () => {
  it('оставляет последний шаг для каждого токена', () => {
    const steps = [
      { token: 1, node_id: 'Start' },
      { token: 2, node_id: 'Start' },
      { token: 1, node_id: 'Task' },
    ];
    expect(latestTokenSteps(steps, 0)).toEqual([{ token: 1, node_id: 'Start' }]);
    expect(latestTokenSteps(steps, 2)).toEqual([
      { token: 1, node_id: 'Task' },
      { token: 2, node_id: 'Start' },
    ]);
    expect(latestTokenSteps(steps, 99).map((step) => step.token)).toEqual([1, 2]);
  });

  it('считает точку по длине ломаной, а не по числу вершин', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(pointAlong(path, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(path, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointAlong(path, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pointAlong(path, 1)).toEqual({ x: 100, y: 100 });
    expect(pointAlong(path, 2)).toEqual({ x: 100, y: 100 });
  });

  it('возвращает null/единственную точку на вырожденных путях', () => {
    expect(pointAlong([], 0.5)).toBeNull();
    expect(pointAlong([{ x: 7, y: 9 }], 0.5)).toEqual({ x: 7, y: 9 });
    expect(
      pointAlong(
        [
          { x: 1, y: 1 },
          { x: 1, y: 1 },
        ],
        0.5,
      ),
    ).toEqual({ x: 1, y: 1 });
  });

  it('ведёт токен по потоку вперёд и по прямой назад', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(tokenRoute({ x: 0, y: 0 }, { x: 100, y: 0 }, path)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 0 },
    ]);
    // Назад от конца потока: ломаная увела бы токен через начало.
    expect(tokenRoute({ x: 100, y: 0 }, { x: 200, y: 0 }, path)).toBeNull();
    expect(tokenRoute({ x: 0, y: 0 }, { x: 1, y: 1 }, null)).toBeNull();
    expect(tokenRoute({ x: 0, y: 0 }, { x: 1, y: 1 }, [{ x: 0, y: 0 }])).toBeNull();
  });

  it('находит центр фигуры или null без размеров', () => {
    expect(centerOf({ x: 10, y: 20, width: 40, height: 10 })).toEqual({ x: 30, y: 25 });
    expect(centerOf({ x: 10, y: 20 })).toBeNull();
  });
});
