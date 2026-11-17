export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Переносит точку примыкания на новую рамку фигуры с сохранением
 * относительного положения: середина стороны остаётся серединой,
 * угол — углом. В отличие от штатного bpmn-js, не оставляет старую точку
 * снаружи/внутри новой рамки (из-за этого стрелка «съезжала» при ресайзе).
 */
export function proportionalAnchor(point: Point, oldBounds: Bounds, newBounds: Bounds): Point {
  if (oldBounds.width === 0 || oldBounds.height === 0) {
    return { x: point.x, y: point.y };
  }

  const oldCenterX = oldBounds.x + oldBounds.width / 2;
  const oldCenterY = oldBounds.y + oldBounds.height / 2;
  const newCenterX = newBounds.x + newBounds.width / 2;
  const newCenterY = newBounds.y + newBounds.height / 2;

  return {
    x: Math.round(newCenterX + (point.x - oldCenterX) * (newBounds.width / oldBounds.width)),
    y: Math.round(newCenterY + (point.y - oldCenterY) * (newBounds.height / oldBounds.height)),
  };
}
