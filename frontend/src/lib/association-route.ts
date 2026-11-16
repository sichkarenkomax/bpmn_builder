// Связь комментария (bpmn:Association) примыкает к серединам сторон фигур
// и идёт ортогонально, как поток: без диагональных отрезков.

import { anchorPoint, closestSide } from './connection-anchors';

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

function center(bounds: Bounds): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** Маршрут связи: выход по ближайшей стороне, изгиб посередине, вход в фигуру. */
export function orthogonalAssociationWaypoints(source: Bounds, target: Bounds): Point[] {
  const sourceSide = closestSide(source, center(target));
  const targetSide = closestSide(target, center(source));
  const start = anchorPoint(source, sourceSide);
  const end = anchorPoint(target, targetSide);
  const horizontal = sourceSide === 'left' || sourceSide === 'right';

  if (horizontal) {
    if (Math.abs(start.y - end.y) < 0.5) {
      return [start, end];
    }
    const midX = Math.round((start.x + end.x) / 2);
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  if (Math.abs(start.x - end.x) < 0.5) {
    return [start, end];
  }
  const midY = Math.round((start.y + end.y) / 2);
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

/** Есть ли в маршруте диагональный отрезок (для проверок и миграции). */
export function hasDiagonalSegment(waypoints: Point[]): boolean {
  for (let index = 1; index < waypoints.length; index += 1) {
    const previous = waypoints[index - 1]!;
    const current = waypoints[index]!;
    if (Math.abs(previous.x - current.x) > 0.5 && Math.abs(previous.y - current.y) > 0.5) {
      return true;
    }
  }
  return false;
}
