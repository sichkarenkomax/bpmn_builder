const SVG_NS = 'http://www.w3.org/2000/svg';
const FRAME_BACKGROUND_LAYER = 'djs-frame-backgrounds';
const HIDDEN_FRAME_SHAPE = 'data-frame-background-hidden';
const FRAME_TYPES = new Set(['bpmn:Participant', 'bpmn:Lane', 'bpmn:Group']);

/** Ширина/высота заголовка пула в bpmn-js: полоса с названием участника. */
export const POOL_HEADER_SIZE = 30;

export interface PoolBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isHorizontal?: boolean;
}

/** Переносит группы пулов в начало слоя, сохраняя порядок остальных фигур. */
export function moveGroupsToFront(layer: Element, groups: Iterable<Element>): void {
  const poolGroups = new Set(groups);
  const nodes = [...layer.children];
  const desired = [
    ...nodes.filter((node) => poolGroups.has(node)),
    ...nodes.filter((node) => !poolGroups.has(node)),
  ];
  for (let index = 0; index < desired.length; index += 1) {
    const node = desired[index];
    if (node && layer.children[index] !== node) {
      layer.insertBefore(node, layer.children[index] ?? null);
    }
  }
}

/**
 * Фоны пулов и дорожек рисуются отдельным нижним слоем. Иначе при наложении
 * пулов друг на друга фон верхнего пула закрывает чужие задачи: перестановка
 * групп целиком этого не решает, потому что вместе с фоном двигаются и дети.
 */
export interface FrameGraphics {
  type: string;
  gfx: SVGGElement;
}

export function renderFrameBackgrounds(items: Iterable<FrameGraphics>): void {
  const all = [...items];
  const doc = all[0]?.gfx.ownerDocument;
  const layers = new Set<Element>();
  for (const { gfx } of all) {
    for (const shape of gfx.querySelectorAll<SVGElement>(`[${HIDDEN_FRAME_SHAPE}]`)) {
      shape.style.visibility = '';
      shape.removeAttribute(HIDDEN_FRAME_SHAPE);
    }
    const layer = gfx.parentNode?.parentNode;
    if (layer instanceof Element) {
      layers.add(layer);
    }
  }
  for (const layer of layers) {
    for (const stale of layer.querySelectorAll(`:scope > .${FRAME_BACKGROUND_LAYER}`)) {
      stale.remove();
    }
  }
  doc?.querySelectorAll(`.${FRAME_BACKGROUND_LAYER}`).forEach((layer) => layer.remove());

  const framesByLayer = new Map<Element, FrameGraphics[]>();
  for (const item of all) {
    if (!FRAME_TYPES.has(item.type)) {
      continue;
    }
    const group = item.gfx.parentNode;
    const layer = group?.parentNode;
    if (!(layer instanceof Element)) {
      continue;
    }
    const frames = framesByLayer.get(layer) ?? [];
    frames.push(item);
    framesByLayer.set(layer, frames);
  }

  for (const [layer, frames] of framesByLayer) {
    const backdrop = layer.ownerDocument.createElementNS(SVG_NS, 'g');
    backdrop.setAttribute('class', FRAME_BACKGROUND_LAYER);
    backdrop.setAttribute('aria-hidden', 'true');
    layer.insertBefore(backdrop, layer.firstChild);

    for (const { gfx } of frames) {
      const visual = gfx.querySelector<SVGGElement>(':scope > .djs-visual');
      if (!visual) {
        continue;
      }
      const wrapper = layer.ownerDocument.createElementNS(SVG_NS, 'g');
      const transform = gfx.getAttribute('transform');
      if (transform) {
        wrapper.setAttribute('transform', transform);
      }
      for (const shape of visual.children) {
        if (!['rect', 'path', 'polygon', 'polyline', 'circle', 'ellipse'].includes(shape.tagName)) {
          continue;
        }
        const clone = shape.cloneNode(true) as SVGElement;
        clone.style.visibility = '';
        clone.style.pointerEvents = 'none';
        clone.removeAttribute(HIDDEN_FRAME_SHAPE);
        wrapper.append(clone);
        (shape as SVGElement).style.visibility = 'hidden';
        shape.setAttribute(HIDDEN_FRAME_SHAPE, '');
      }
      if (wrapper.childElementCount > 0) {
        backdrop.append(wrapper);
      }
    }
  }
}

export interface LaneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Дорожка не должна заходить на заголовок пула. Bizagi в XPDL иногда ставит
 * её левый край в x пула: подпись дорожки оказывается прямо под названием
 * участника. Сдвигаем дорожку за заголовок, сохраняя её правый/нижний край.
 */
export function laneBoundsOutsidePoolHeader(pool: PoolBounds, lane: LaneBounds): LaneBounds | null {
  const isHorizontal = pool.isHorizontal !== false;
  if (isHorizontal) {
    const minX = pool.x + POOL_HEADER_SIZE;
    if (lane.x >= minX || lane.width <= 0) {
      return null;
    }
    const right = lane.x + lane.width;
    const width = right - minX;
    return width > 0 ? { ...lane, x: minX, width } : null;
  }

  const minY = pool.y + POOL_HEADER_SIZE;
  if (lane.y >= minY || lane.height <= 0) {
    return null;
  }
  const bottom = lane.y + lane.height;
  const height = bottom - minY;
  return height > 0 ? { ...lane, y: minY, height } : null;
}
