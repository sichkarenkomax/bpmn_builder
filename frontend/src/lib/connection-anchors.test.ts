import { describe, expect, it } from 'vitest';

import { anchorPoint, closestSide } from './connection-anchors';

const bounds = { x: 10, y: 20, width: 100, height: 60 };

describe('точки примыкания связи', () => {
  it('берёт середины четырёх сторон', () => {
    expect(anchorPoint(bounds, 'top')).toEqual({ x: 60, y: 20 });
    expect(anchorPoint(bounds, 'right')).toEqual({ x: 110, y: 50 });
    expect(anchorPoint(bounds, 'bottom')).toEqual({ x: 60, y: 80 });
    expect(anchorPoint(bounds, 'left')).toEqual({ x: 10, y: 50 });
  });

  it('определяет ближайшую сторону по точке', () => {
    expect(closestSide(bounds, { x: 60, y: 5 })).toBe('top');
    expect(closestSide(bounds, { x: 200, y: 50 })).toBe('right');
    expect(closestSide(bounds, { x: 60, y: 200 })).toBe('bottom');
    expect(closestSide(bounds, { x: 0, y: 50 })).toBe('left');
  });
});
