import { describe, expect, it } from 'vitest';

import { proportionalAnchor } from './resize-anchors';

describe('proportionalAnchor', () => {
  it('сохраняет середину левой стороны при изменении высоты', () => {
    expect(
      proportionalAnchor(
        { x: 270, y: 117 },
        { x: 270, y: 77, width: 100, height: 80 },
        { x: 270, y: 77, width: 100, height: 60 },
      ),
    ).toEqual({ x: 270, y: 107 });
  });

  it('переносит точку на нижнюю сторону при сжатии сверху', () => {
    expect(
      proportionalAnchor(
        { x: 320, y: 157 },
        { x: 270, y: 77, width: 100, height: 80 },
        { x: 270, y: 97, width: 100, height: 60 },
      ),
    ).toEqual({ x: 320, y: 157 });
  });

  it('сохраняет угол при растягивании по обеим осям', () => {
    expect(
      proportionalAnchor(
        { x: 270, y: 77 },
        { x: 270, y: 77, width: 100, height: 80 },
        { x: 250, y: 67, width: 160, height: 120 },
      ),
    ).toEqual({ x: 250, y: 67 });
  });
});
