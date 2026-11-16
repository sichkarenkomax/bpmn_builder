/** Четыре точки примыкания связи: сверху, справа, снизу, слева. */

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left';

export const ANCHOR_SIDES: { id: AnchorSide; label: string }[] = [
  { id: 'top', label: 'Сверху' },
  { id: 'right', label: 'Справа' },
  { id: 'bottom', label: 'Снизу' },
  { id: 'left', label: 'Слева' },
];

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

export function anchorPoint(bounds: Bounds, side: AnchorSide): Point {
  switch (side) {
    case 'top':
      return { x: bounds.x + bounds.width / 2, y: bounds.y };
    case 'right':
      return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
    case 'bottom':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
    case 'left':
      return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  }
}

/** Ближайшая сторона фигуры к точке — для начального выбора в диалоге. */
export function closestSide(bounds: Bounds, point: Point): AnchorSide {
  const dx = (point.x - (bounds.x + bounds.width / 2)) / Math.max(bounds.width, 1);
  const dy = (point.y - (bounds.y + bounds.height / 2)) / Math.max(bounds.height, 1);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}
