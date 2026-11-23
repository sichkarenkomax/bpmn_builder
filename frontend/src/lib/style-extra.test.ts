import { describe, expect, it } from 'vitest';

import { applyExternalLabelLayout, applyTextDirection } from './style-extra';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeGfx(text = 'Подпись') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const gfx = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  const visual = document.createElementNS(SVG_NS, 'g');
  visual.setAttribute('class', 'djs-visual');
  const hit = document.createElementNS(SVG_NS, 'rect');
  hit.setAttribute('class', 'djs-hit');
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'djs-label');
  const line = document.createElementNS(SVG_NS, 'tspan');
  line.textContent = text;
  label.append(line);
  visual.append(label);
  gfx.append(visual, hit);
  svg.append(gfx);
  document.body.append(svg);
  return { gfx, visual, label, line, cleanup: () => svg.remove() };
}

type Host = { x?: number; y?: number; width?: number; height?: number; waypoints?: unknown };

function labelElement(labelTarget: Host | undefined, x = 100, y = 180, width = 100, height = 20) {
  return { type: 'label', x, y, width, height, labelTarget };
}

const HOST: Host = { x: 80, y: 100, width: 100, height: 80 };

describe('applyTextDirection', () => {
  it('поворачивает многострочный текст, не склеивая строки', () => {
    const { label, cleanup } = makeGfx();
    const second = document.createElementNS(SVG_NS, 'tspan');
    second.textContent = 'вторая строка';
    label.append(second);

    applyTextDirection(label, 'vertical');
    expect(label.style.transform).toBe('rotate(90deg)');
    expect(label.style.writingMode).toBe('');
    expect(label.querySelectorAll('tspan')).toHaveLength(2);

    applyTextDirection(label, 'rotate');
    expect(label.style.transform).toBe('rotate(-90deg)');
    cleanup();
  });

  it('не поворачивает текст, если поворачивается весь фрейм', () => {
    const { label, cleanup } = makeGfx();
    applyTextDirection(label, 'vertical', false);
    expect(label.style.transform).toBe('');
    cleanup();
  });
});

describe('applyExternalLabelLayout', () => {
  it('добавляет зазор подписью, прижатой к нижней границе фигуры', () => {
    const { gfx, visual, cleanup } = makeGfx();
    applyExternalLabelLayout(gfx, labelElement(HOST), '');

    expect(visual.style.transform).toBe('translateY(4px)');
    cleanup();
  });

  it('не двигает подпись с готовым отступом и подпись над фигурой', () => {
    const spaced = makeGfx();
    applyExternalLabelLayout(spaced.gfx, labelElement(HOST, 100, 188), '');
    expect(spaced.visual.style.transform).toBe('');
    spaced.cleanup();

    const above = makeGfx();
    applyExternalLabelLayout(above.gfx, labelElement(HOST, 100, 60), '');
    expect(above.visual.style.transform).toBe('');
    above.cleanup();
  });

  it('центрирует подпись связи, не сдвигая её к фигуре', () => {
    const flow = makeGfx();
    applyExternalLabelLayout(flow.gfx, labelElement({ ...HOST, waypoints: [] }), '');
    expect(flow.visual.style.transform).toBe('');
    expect(flow.label.getAttribute('text-anchor')).toBe('middle');
    expect(flow.line.getAttribute('x')).toBe('50');
    flow.cleanup();

    const shape = makeGfx();
    applyExternalLabelLayout(shape.gfx, { ...labelElement(HOST), type: 'shape' }, 'left');
    expect(shape.line.getAttribute('x')).toBeNull();
    shape.cleanup();
  });

  it('расширяет видимый фрейм подписи связи, не меняя геометрию элемента', () => {
    const { gfx, label, line, cleanup } = makeGfx();
    label.getBBox = () => ({ x: 0, y: 0, width: 160, height: 14 }) as DOMRect;
    const element = labelElement({ ...HOST, waypoints: [] }, 100, 180, 100, 20);

    applyExternalLabelLayout(gfx, element, '');

    // Ширина элемента не меняется: иначе bpmn-js переразобьёт строки.
    expect(element.width).toBe(100);
    expect(element.x).toBe(100);
    expect(element.height).toBe(20);
    expect(gfx.getAttribute('transform')).toBeNull();
    expect(gfx.querySelector('.djs-hit')?.getAttribute('x')).toBe('-37');
    expect(gfx.querySelector('.djs-hit')?.getAttribute('width')).toBe('174');
    expect(label.getAttribute('text-anchor')).toBe('middle');
    expect(line.getAttribute('x')).toBe('50');
    cleanup();
  });

  it('поворачивает фрейм подписи целиком для вертикального текста', () => {
    const { gfx, label, visual, cleanup } = makeGfx();
    applyExternalLabelLayout(gfx, labelElement(HOST), '', 'vertical');

    expect(visual.style.transform).toBe('translateY(4px) rotate(90deg)');
    expect(label.style.transform).toBe('');
    cleanup();
  });

  it('выравнивает текст внутри фрейма, не сдвигая сам фрейм', () => {
    const left = makeGfx();
    const leftElement = labelElement(HOST, 137, 222, 80, 24);
    applyExternalLabelLayout(left.gfx, leftElement, 'left');
    expect(left.label.getAttribute('text-anchor')).toBe('start');
    expect(left.line.getAttribute('x')).toBe('7');
    expect(leftElement.x).toBe(137);
    expect(leftElement.y).toBe(222);
    left.cleanup();

    const right = makeGfx();
    applyExternalLabelLayout(right.gfx, labelElement(HOST), 'right');
    expect(right.label.getAttribute('text-anchor')).toBe('end');
    expect(right.line.getAttribute('x')).toBe('93');
    right.cleanup();

    const center = makeGfx();
    applyExternalLabelLayout(center.gfx, labelElement(HOST), 'center');
    expect(center.label.getAttribute('text-anchor')).toBe('middle');
    expect(center.line.getAttribute('x')).toBe('50');
    center.cleanup();
  });

  it('расширяет тесный фрейм и не сужает широкий', () => {
    const tight = makeGfx();
    tight.label.getBBox = () => ({ x: 0, y: 0, width: 60, height: 14 }) as DOMRect;
    const element = labelElement(HOST, 137, 222, 40, 16);

    applyExternalLabelLayout(tight.gfx, element, 'left');

    expect(element.x).toBe(137);
    expect(element.y).toBe(222);
    expect(element.width).toBe(40);
    expect(element.height).toBe(16);
    expect(tight.gfx.getAttribute('transform')).toBeNull();
    expect(tight.gfx.querySelector('.djs-hit')?.getAttribute('x')).toBe('-17');
    expect(tight.gfx.querySelector('.djs-hit')?.getAttribute('y')).toBe('-1');
    expect(tight.gfx.querySelector('.djs-hit')?.getAttribute('width')).toBe('74');
    expect(tight.gfx.querySelector('.djs-hit')?.getAttribute('height')).toBe('18');
    expect(tight.line.getAttribute('x')).toBe('7');
    tight.cleanup();

    // Пользователь сузил или расширил фрейм вручную — не возвращаем размер
    // обратно к ширине текста при следующем перемещении.
    const wide = makeGfx();
    wide.label.getBBox = () => ({ x: 0, y: 0, width: 60, height: 14 }) as DOMRect;
    const wideElement = labelElement(HOST, 137, 222, 300, 18);
    applyExternalLabelLayout(wide.gfx, wideElement, 'left');
    expect(wideElement.width).toBe(300);
    expect(wideElement.x).toBe(137);
    wide.cleanup();
  });

  it('уменьшает отступ у мелких фреймов и не падает без labelTarget', () => {
    const small = makeGfx();
    applyExternalLabelLayout(small.gfx, labelElement(HOST, 100, 180, 20), 'left');
    expect(small.line.getAttribute('x')).toBe('5');
    small.cleanup();

    const orphan = makeGfx();
    expect(() =>
      applyExternalLabelLayout(orphan.gfx, labelElement(undefined), 'left'),
    ).not.toThrow();
    expect(orphan.line.getAttribute('x')).toBeNull();
    orphan.cleanup();
  });
});
