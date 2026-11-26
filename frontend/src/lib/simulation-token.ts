/** Геометрия оверлея токена: позиции элементов и движение по ломаной потока. */

export interface TokenPoint {
  x: number;
  y: number;
}

/** Текущий шаг каждого токена на отрезке журнала [0..index]. */
export function latestTokenSteps<T extends { token: number }>(steps: T[], index: number): T[] {
  const latest = new Map<number, T>();
  const limit = Math.min(Math.max(index, 0), steps.length - 1);
  for (let position = 0; position <= limit; position += 1) {
    const step = steps[position];
    if (step) {
      latest.set(step.token, step);
    }
  }
  return [...latest.values()];
}

/** Точка на ломаной по доле пройденного пути 0..1. */
export function pointAlong(points: TokenPoint[], progress: number): TokenPoint | null {
  const first = points[0];
  if (!first) {
    return null;
  }
  if (points.length === 1) {
    return first;
  }
  const clamped = Math.min(Math.max(progress, 0), 1);
  const lengths: number[] = [];
  let total = 0;
  for (let position = 1; position < points.length; position += 1) {
    const start = points[position - 1];
    const end = points[position];
    if (!start || !end) {
      continue;
    }
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    lengths.push(length);
    total += length;
  }
  if (total === 0) {
    return first;
  }
  let remaining = clamped * total;
  for (let position = 0; position < lengths.length; position += 1) {
    const length = lengths[position] ?? 0;
    if (remaining <= length || position === lengths.length - 1) {
      const start = points[position];
      const end = points[position + 1];
      if (!start || !end) {
        continue;
      }
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    remaining -= length;
  }
  return points[points.length - 1] ?? null;
}

/** Середина фигуры в координатах схемы. */
export function centerOf(element: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): TokenPoint | null {
  if (
    typeof element.x !== 'number' ||
    typeof element.y !== 'number' ||
    typeof element.width !== 'number' ||
    typeof element.height !== 'number'
  ) {
    return null;
  }
  return { x: element.x + element.width / 2, y: element.y + element.height / 2 };
}
