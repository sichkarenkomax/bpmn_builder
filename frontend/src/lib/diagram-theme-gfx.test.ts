import { describe, expect, it } from 'vitest';

import { applyThemeToGfx, themeById } from './diagram-theme';

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeGfx(shapes: string[]): SVGGElement {
  const gfx = document.createElementNS(SVG_NS, 'g');
  const visual = document.createElementNS(SVG_NS, 'g');
  visual.setAttribute('class', 'djs-visual');
  for (const tag of shapes) {
    visual.append(document.createElementNS(SVG_NS, tag));
  }
  gfx.append(visual);
  return gfx as SVGGElement;
}

describe('applyThemeToGfx', () => {
  it('делает стрелки чёрными в любой теме', () => {
    const gfx = makeGfx(['path']);
    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeById('classic'));
    const path = gfx.querySelector('path');
    expect(path?.style.stroke).toBe('#000000');
  });

  it('красит маркер стрелки в чёрный', () => {
    const gfx = makeGfx([]);
    const visual = gfx.querySelector('.djs-visual');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    const path = document.createElementNS(SVG_NS, 'path');
    marker.append(path);
    defs.append(marker);
    visual?.append(defs);

    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeById('classic'));

    expect(path.style.stroke).toBe('#000000');
    expect(path.style.fill).toBe('#000000');
  });

  it('даёт завершающему событию толстую границу', () => {
    const gfx = makeGfx(['circle']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('classic'));
    const circle = gfx.querySelector('circle');
    expect(circle?.style.strokeWidth).toBe('4px');
    expect(circle?.style.stroke).toBe('#dc2626');
  });

  it('не перекрывает ручную толщину завершающего события', () => {
    const gfx = makeGfx(['circle']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('classic'), { strokeWidth: '2' });
    expect(gfx.querySelector('circle')?.style.strokeWidth).toBe('');
  });
});
