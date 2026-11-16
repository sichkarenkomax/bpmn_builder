import { describe, expect, it } from 'vitest';

import { hasDiagonalSegment, orthogonalAssociationWaypoints } from './association-route';

const source = { x: 100, y: 100, width: 100, height: 80 };
const target = { x: 400, y: 300, width: 100, height: 80 };

describe('маршрут связи комментария', () => {
  it('идёт от середины правой стороны к середине левой и не содержит диагоналей', () => {
    const waypoints = orthogonalAssociationWaypoints(source, target);

    expect(waypoints[0]).toEqual({ x: 200, y: 140 });
    expect(waypoints.at(-1)).toEqual({ x: 400, y: 340 });
    expect(hasDiagonalSegment(waypoints)).toBe(false);
    expect(waypoints.length).toBe(4);
  });

  it('для фигур друг над другом выходит сверху/снизу и гнётся по вертикали', () => {
    const below = { x: 110, y: 400, width: 80, height: 60 };
    const waypoints = orthogonalAssociationWaypoints(source, below);

    expect(waypoints[0]).toEqual({ x: 150, y: 180 });
    expect(waypoints.at(-1)).toEqual({ x: 150, y: 400 });
    expect(waypoints.length).toBe(2);
    expect(hasDiagonalSegment(waypoints)).toBe(false);
  });

  it('без смещения по второй оси оставляет прямую линию', () => {
    const right = { x: 400, y: 100, width: 100, height: 80 };
    const waypoints = orthogonalAssociationWaypoints(source, right);

    expect(waypoints).toEqual([
      { x: 200, y: 140 },
      { x: 400, y: 140 },
    ]);
  });
});
