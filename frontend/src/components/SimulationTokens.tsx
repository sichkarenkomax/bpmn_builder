import { useEffect, useRef, useState } from 'react';

import type { SimulationStep } from '../lib/api';
import { latestTokenSteps, pointAlong, type TokenPoint } from '../lib/simulation-token';

/** Длительность перехода токена к следующему шагу, мс (делится на скорость). */
const TRAVEL_MS = 520;

interface Travel {
  token: number;
  from: TokenPoint;
  to: TokenPoint;
  path: TokenPoint[] | null;
}

function interpolate(from: TokenPoint, to: TokenPoint, progress: number): TokenPoint {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function easeInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
}

/**
 * Токены поверх холста: каждый токен — кружок с номером, который едет по
 * ломаной своего входящего потока к текущему шагу. Позиции в координатах схемы,
 * на экран пересчитываются через viewBox, поэтому токен не отстаёт при зуме.
 */
export function SimulationTokens({
  steps,
  index,
  speed,
  nodes,
  flows,
  viewbox,
}: {
  steps: SimulationStep[];
  index: number;
  speed: number;
  nodes: Record<string, TokenPoint>;
  flows: Record<string, TokenPoint[]>;
  viewbox: { x: number; y: number; scale: number };
}) {
  const [positions, setPositions] = useState<Record<number, TokenPoint>>({});
  const positionsRef = useRef<Record<number, TokenPoint>>({});

  // Новый прогон — токены появляются заново, без прыжка со старого места.
  useEffect(() => {
    positionsRef.current = {};
    setPositions({});
  }, [steps]);

  useEffect(() => {
    const targets = latestTokenSteps(steps, index);
    if (targets.length === 0) {
      return;
    }
    const duration = TRAVEL_MS / Math.max(speed, 0.25);
    const resting: Record<number, TokenPoint> = {};
    const travels: Travel[] = [];

    for (const step of targets) {
      const to = nodes[step.node_id];
      if (!to) {
        continue;
      }
      const path = step.flow_id ? (flows[step.flow_id] ?? null) : null;
      const previous = positionsRef.current[step.token];
      const from = previous ?? path?.[0] ?? to;
      if (Math.hypot(from.x - to.x, from.y - to.y) < 0.5) {
        resting[step.token] = to;
        continue;
      }
      travels.push({ token: step.token, from, to, path });
    }

    if (travels.length === 0) {
      positionsRef.current = resting;
      setPositions(resting);
      return;
    }

    let frame = 0;
    let startedAt: number | null = null;
    const tick = (now: number) => {
      startedAt ??= now;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = easeInOut(progress);
      const framePositions: Record<number, TokenPoint> = { ...resting };
      for (const travel of travels) {
        framePositions[travel.token] =
          travel.path && travel.path.length > 1
            ? (pointAlong(travel.path, eased) ?? travel.to)
            : interpolate(travel.from, travel.to, eased);
      }
      positionsRef.current = framePositions;
      setPositions(framePositions);
      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [steps, index, speed, nodes, flows]);

  const tokens = Object.entries(positions);
  if (tokens.length === 0) {
    return null;
  }

  return (
    <div className="sim-tokens" aria-hidden="true" data-testid="sim-tokens">
      {tokens.map(([token, point]) => {
        const left = (point.x - viewbox.x) * viewbox.scale;
        const top = (point.y - viewbox.y) * viewbox.scale;
        return (
          <span
            key={token}
            className="sim-token"
            data-token={token}
            style={{ transform: `translate3d(${left}px, ${top}px, 0)` }}
          >
            <span className="sim-token__dot">{token}</span>
          </span>
        );
      })}
    </div>
  );
}
