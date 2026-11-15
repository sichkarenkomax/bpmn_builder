import { describe, expect, it } from 'vitest';

import { applyExternalLabelLayout } from './style-extra';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeGfx(text = 'Подпись') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const gfx = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  const visual = document.createElementNS(SVG_NS, 'g');
  visual.setAttribute('class', 'djs-visual');
  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'djs-label');
  const line = document.createElementNS(SVG_NS, 'tspan');
  line.textContent = text;
  label.append(line);
  visual.append(label);
  gfx.append(visual);
  svg.append(gfx);
  document.body.append(svg);
  return { gfx, visual, label, line, cleanup: () => svg.remove() };
}

type Host = { x?: number; y?: number; width?: number; height?: number; waypoints?: unknown };

function labelElement(labelTarget: Host | undefined, x = 100, y = 180) {
  return { type: 'label', x, y, labelTarget };
}

const HOST: Host = { x: 80, y: 100, width: 100, height: 80 };

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

  it('не трогает подписи связей и не-подписи', () => {
    const flow = makeGfx();
    applyExternalLabelLayout(flow.gfx, labelElement({ ...HOST, waypoints: [] }), 'left');
    expect(flow.visual.style.transform).toBe('');
    expect(flow.line.getAttribute('x')).toBeNull();
    flow.cleanup();

    const shape = makeGfx();
    applyExternalLabelLayout(shape.gfx, { ...labelElement(HOST), type: 'shape' }, 'left');
    expect(shape.line.getAttribute('x')).toBeNull();
    shape.cleanup();
  });

  it('выравнивает текст по левому, правому краю и центру фигуры', () => {
    const left = makeGfx();
    applyExternalLabelLayout(left.gfx, labelElement(HOST), 'left');
    expect(left.label.getAttribute('text-anchor')).toBe('start');
    // host.x + 7 px отступа − element.x
    expect(left.line.getAttribute('x')).toBe('-13');
    left.cleanup();

    const right = makeGfx();
    applyExternalLabelLayout(right.gfx, labelElement(HOST), 'right');
    expect(right.label.getAttribute('text-anchor')).toBe('end');
    expect(right.line.getAttribute('x')).toBe('73');
    right.cleanup();

    const center = makeGfx();
    applyExternalLabelLayout(center.gfx, labelElement(HOST), 'center');
    expect(center.label.getAttribute('text-anchor')).toBe('middle');
    expect(center.line.getAttribute('x')).toBe('30');
    center.cleanup();
  });

  it('уменьшает отступ у мелких фигур и не падает без labelTarget', () => {
    const small = makeGfx();
    applyExternalLabelLayout(small.gfx, labelElement({ ...HOST, width: 20 }), 'left');
    expect(small.line.getAttribute('x')).toBe('-15');
    small.cleanup();

    const orphan = makeGfx();
    expect(() =>
      applyExternalLabelLayout(orphan.gfx, labelElement(undefined), 'left'),
    ).not.toThrow();
    expect(orphan.line.getAttribute('x')).toBeNull();
    orphan.cleanup();
  });
});
