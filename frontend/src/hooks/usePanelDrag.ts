import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import {
  clearPanelLayout,
  loadPanelLayout,
  savePanelLayout,
  type PanelLayout,
} from '../lib/panel-layout';

interface DragBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  bounds: DragBounds;
}

interface ResizeState {
  pointerId: number;
  startX: number;
  startY: number;
  originWidth: number;
  originHeight: number;
  maxWidth: number;
  maxHeight: number;
}

const MIN_WIDTH = 240;
const MIN_HEIGHT = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Перетаскивание оверлея за заголовок и изменение размера за угол. Панели
 * стоят в колонке друг под другом, поэтому смещение — это transform: соседи
 * не сдвигаются, а перетащенная панель поднимается над остальными.
 * Положение и размер запоминаются в localStorage для конкретной диаграммы.
 * Двойной клик по заголовку возвращает панель к раскладке по умолчанию.
 */
export function usePanelDrag(name: string, scope: string, auto: boolean) {
  const panelRef = useRef<HTMLElement | null>(null);
  const [layout, setLayout] = useState<PanelLayout>(() => loadPanelLayout(scope, name));
  const layoutRef = useRef(layout);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  const updateLayout = (patch: Partial<PanelLayout>) => {
    const next = { ...layoutRef.current, ...patch };
    layoutRef.current = next;
    setLayout(next);
  };

  // Автоположение не удаляет сохранённые раскладки само — это делает экран,
  // чтобы сбросить и закрытые панели; здесь достаточно вернуть панель в поток.
  useEffect(() => {
    if (!auto) {
      return;
    }
    const next = { x: 0, y: 0 };
    layoutRef.current = next;
    setLayout(next);
  }, [auto]);

  const canvasBounds = () => {
    const node = panelRef.current;
    const canvas = node?.closest<HTMLElement>('.canvas');
    if (!node || !canvas) {
      return null;
    }
    return { node, canvas };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (auto || event.button !== 0) {
      return;
    }
    // Кнопки, ссылки и поля в заголовке должны работать как обычно.
    if ((event.target as HTMLElement).closest('button, a, input, select, textarea, summary')) {
      return;
    }
    const bounds = canvasBounds();
    if (!bounds) {
      return;
    }
    const rect = bounds.node.getBoundingClientRect();
    const canvasRect = bounds.canvas.getBoundingClientRect();
    // Базовый прямоугольник без текущего смещения, чтобы границы не уползали.
    const baseLeft = rect.left - layoutRef.current.x;
    const baseTop = rect.top - layoutRef.current.y;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layoutRef.current.x,
      originY: layoutRef.current.y,
      bounds: {
        minX: canvasRect.left - baseLeft,
        maxX: canvasRect.right - rect.width - baseLeft,
        minY: canvasRect.top - baseTop,
        maxY: canvasRect.bottom - rect.height - baseTop,
      },
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    updateLayout({
      x: clamp(drag.originX + event.clientX - drag.startX, drag.bounds.minX, drag.bounds.maxX),
      y: clamp(drag.originY + event.clientY - drag.startY, drag.bounds.minY, drag.bounds.maxY),
    });
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    savePanelLayout(scope, name, layoutRef.current);
  };

  const onDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (auto || (event.target as HTMLElement).closest('button, a, input, select, textarea')) {
      return;
    }
    const next = { x: 0, y: 0 };
    layoutRef.current = next;
    setLayout(next);
    clearPanelLayout(scope, name);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (auto || event.button !== 0) {
      return;
    }
    const bounds = canvasBounds();
    if (!bounds) {
      return;
    }
    const rect = bounds.node.getBoundingClientRect();
    const canvasRect = bounds.canvas.getBoundingClientRect();
    // Тянем правый нижний угол: левый верхний остаётся на месте.
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: rect.width,
      originHeight: rect.height,
      maxWidth: canvasRect.right - rect.left,
      maxHeight: canvasRect.bottom - rect.top,
    };
    setResizing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }
    updateLayout({
      width: clamp(resize.originWidth + event.clientX - resize.startX, MIN_WIDTH, resize.maxWidth),
      height: clamp(
        resize.originHeight + event.clientY - resize.startY,
        MIN_HEIGHT,
        resize.maxHeight,
      ),
    });
  };

  const endResize = (event: ReactPointerEvent<HTMLElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) {
      return;
    }
    resizeRef.current = null;
    setResizing(false);
    savePanelLayout(scope, name, layoutRef.current);
  };

  return {
    panelRef,
    dragging,
    resizing,
    panelStyle: {
      transform:
        auto || (layout.x === 0 && layout.y === 0)
          ? undefined
          : `translate(${layout.x}px, ${layout.y}px)`,
      width: auto ? undefined : layout.width,
      height: auto ? undefined : layout.height,
      zIndex: dragging || resizing ? 140 : undefined,
    },
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick,
    },
    resizeHandleProps: {
      onPointerDown: onResizePointerDown,
      onPointerMove: onResizePointerMove,
      onPointerUp: endResize,
      onPointerCancel: endResize,
    },
  };
}
