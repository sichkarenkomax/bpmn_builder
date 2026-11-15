import { useRef } from 'react';

import type { LegendPosition } from '../lib/diagram-settings';

export type LegendItem = {
  label: string;
  fill: string;
  stroke: string;
};

export function DiagramLegend({
  items,
  position,
  onMove,
  onDragEnd,
  onClose,
}: {
  items: LegendItem[];
  position: LegendPosition;
  onMove: (position: LegendPosition) => void;
  onDragEnd: (position: LegendPosition) => void;
  onClose: () => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    dx: number;
    dy: number;
    last: LegendPosition;
  } | null>(null);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = nodeRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    dragRef.current = {
      pointerId: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      last: position,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const container = nodeRef.current?.parentElement;
    if (!drag || !container || drag.pointerId !== event.pointerId) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const width = nodeRef.current?.offsetWidth ?? 0;
    const height = nodeRef.current?.offsetHeight ?? 0;
    const next = {
      x: Math.min(
        Math.max(0, event.clientX - rect.left - drag.dx),
        Math.max(0, rect.width - width),
      ),
      y: Math.min(
        Math.max(0, event.clientY - rect.top - drag.dy),
        Math.max(0, rect.height - height),
      ),
    };
    drag.last = next;
    onMove(next);
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    onDragEnd(drag.last);
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      ref={nodeRef}
      className="canvas-legend"
      style={{ left: position.x, top: position.y }}
      role="complementary"
      aria-label="Легенда схемы"
    >
      <div
        className="canvas-legend__header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span>Легенда</span>
        <button type="button" className="canvas-legend__close" onClick={onClose} title="Скрыть">
          ×
        </button>
      </div>
      <ul className="canvas-legend__list">
        {items.map((item) => (
          <li key={item.label} className="canvas-legend__item">
            <span
              className="canvas-legend__swatch"
              style={{ background: item.fill, borderColor: item.stroke }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
