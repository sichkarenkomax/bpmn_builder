import { describe, expect, it } from 'vitest';

import {
  laneBoundsOutsidePoolHeader,
  moveGroupsToFront,
  renderFrameBackgrounds,
  type FrameGraphics,
} from './pool-layout';

const SVG_NS = 'http://www.w3.org/2000/svg';

function createFrame(
  layer: Element,
  id: string,
  type = 'bpmn:Participant',
): FrameGraphics & { layer: Element } {
  const group = document.createElementNS(SVG_NS, 'g');
  const gfx = document.createElementNS(SVG_NS, 'g');
  gfx.setAttribute('class', 'djs-element djs-shape');
  gfx.setAttribute('data-element-id', id);
  const visual = document.createElementNS(SVG_NS, 'g');
  visual.setAttribute('class', 'djs-visual');
  const rect = document.createElementNS(SVG_NS, 'rect');
  const text = document.createElementNS(SVG_NS, 'text');
  text.textContent = id;
  visual.append(rect, text);
  const hit = document.createElementNS(SVG_NS, 'rect');
  hit.setAttribute('class', 'djs-hit djs-hit-no-move');
  const children = document.createElementNS(SVG_NS, 'g');
  children.setAttribute('class', 'djs-children');
  gfx.append(visual, hit);
  group.append(gfx, children);
  layer.append(group);
  return { type, gfx, layer };
}

const pool = { x: 100, y: 100, width: 700, height: 200, isHorizontal: true };

describe('moveGroupsToFront', () => {
  it('ставит группу пула перед фигурами, не меняя порядок остальных', () => {
    const layer = document.createElement('div');
    const task = document.createElement('div');
    const poolGroup = document.createElement('div');
    const event = document.createElement('div');
    layer.append(task, poolGroup, event);

    moveGroupsToFront(layer, [poolGroup]);

    expect([...layer.children]).toEqual([poolGroup, task, event]);
  });

  it('оставляет слой без изменений, если пул уже первый', () => {
    const layer = document.createElement('div');
    const poolGroup = document.createElement('div');
    const task = document.createElement('div');
    layer.append(poolGroup, task);

    moveGroupsToFront(layer, [poolGroup]);

    expect([...layer.children]).toEqual([poolGroup, task]);
  });
});

describe('renderFrameBackgrounds', () => {
  it('выносит фон рам в нижний слой, оставляя подписи и клики рабочими', () => {
    const layer = document.createElementNS(SVG_NS, 'g');
    const a = createFrame(layer, 'Pool_A');
    const b = createFrame(layer, 'Pool_B');
    const items = [a, b];

    renderFrameBackgrounds(items);

    const backdrop = a.layer.firstElementChild!;
    expect(backdrop.classList.contains('djs-frame-backgrounds')).toBe(true);
    expect(backdrop.querySelectorAll('text')).toHaveLength(0);
    expect(backdrop.querySelectorAll('.djs-hit-no-move')).toHaveLength(0);
    expect(backdrop.querySelectorAll('rect')).toHaveLength(2);

    const visualRect = a.gfx.querySelector('.djs-visual > rect') as SVGRectElement;
    expect(visualRect.style.visibility).toBe('hidden');
    expect(a.gfx.querySelector('text')!.style.visibility).toBe('');
    const bodyHit = a.gfx.querySelector('.djs-hit-no-move') as SVGRectElement;
    expect(bodyHit.style.pointerEvents).toBe('');
  });

  it('не дублирует слой и возвращает исходный фон, если рам больше нет', () => {
    const layer = document.createElementNS(SVG_NS, 'g');
    const a = createFrame(layer, 'Pool_A');
    const item = { ...a };

    renderFrameBackgrounds([item]);
    renderFrameBackgrounds([item]);
    expect(a.layer.querySelectorAll('.djs-frame-backgrounds')).toHaveLength(1);

    renderFrameBackgrounds([{ ...item, type: 'bpmn:Task' }]);

    expect(a.layer.querySelector('.djs-frame-backgrounds')).toBeNull();
    expect((a.gfx.querySelector('.djs-visual > rect') as SVGRectElement).style.visibility).toBe('');
    expect((a.gfx.querySelector('.djs-hit-no-move') as SVGRectElement).style.pointerEvents).toBe(
      '',
    );
  });
});

describe('laneBoundsOutsidePoolHeader', () => {
  it('сдвигает горизонтальную дорожку за заголовок пула, сохраняя правый край', () => {
    expect(laneBoundsOutsidePoolHeader(pool, { x: 100, y: 100, width: 700, height: 100 })).toEqual({
      x: 130,
      y: 100,
      width: 670,
      height: 100,
    });
  });

  it('не трогает дорожку, которая уже начинается после заголовка', () => {
    expect(
      laneBoundsOutsidePoolHeader(pool, { x: 130, y: 100, width: 670, height: 100 }),
    ).toBeNull();
  });

  it('для вертикального пула отступает от верхнего заголовка', () => {
    expect(
      laneBoundsOutsidePoolHeader(
        { ...pool, isHorizontal: false },
        { x: 100, y: 100, width: 100, height: 200 },
      ),
    ).toEqual({ x: 100, y: 130, width: 100, height: 170 });
  });

  it('не создаёт дорожку нулевого размера', () => {
    expect(
      laneBoundsOutsidePoolHeader(pool, { x: 100, y: 100, width: 20, height: 100 }),
    ).toBeNull();
  });
});
