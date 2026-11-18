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
  it('делает стрелки чёрными и тонкими в любой теме', () => {
    const gfx = makeGfx(['path']);
    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeById('classic'));
    const path = gfx.querySelector('path');
    expect(path?.style.stroke).toBe('#000000');
    expect(path?.style.strokeWidth).toBe('0.7');
  });

  it('не перекрывает ручную толщину линии связи', () => {
    const gfx = makeGfx(['path']);
    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeById('classic'), { strokeWidth: '2' });
    expect(gfx.querySelector('path')?.style.strokeWidth).toBe('2');

    const association = makeGfx(['path']);
    applyThemeToGfx(association, 'bpmn:Association', themeById('classic'), { strokeWidth: '2' });
    expect(association.querySelector('path')?.style.strokeWidth).toBe('2');
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
    expect(marker.getAttribute('markerUnits')).toBe('userSpaceOnUse');
    expect(marker.getAttribute('markerWidth')).toBe('12');
    expect(marker.getAttribute('markerHeight')).toBe('12');
  });

  it('даёт аннотации мягкий фон и красит только скобку', () => {
    const gfx = makeGfx(['rect', 'path']);
    applyThemeToGfx(gfx, 'bpmn:TextAnnotation', themeById('classic'));
    const [background, bracket] = gfx.querySelectorAll<SVGElement>('.djs-visual > *');
    expect(background?.style.fill).toBe('#f8fafc');
    expect(background?.style.stroke).toBe('none');
    expect(bracket?.style.fill).toBe('none');
    expect(bracket?.style.stroke).toBe('#4b5563');
  });

  it('рисует ассоциацию точками толщиной 1', () => {
    const gfx = makeGfx(['path']);
    applyThemeToGfx(gfx, 'bpmn:Association', themeById('classic'));
    const path = gfx.querySelector('path');
    expect(path?.style.strokeDasharray).toBe('0 6');
    expect(path?.style.strokeLinecap).toBe('round');
    expect(path?.style.strokeWidth).toBe('1');
  });

  it('даёт завершающему событию толстую границу', () => {
    const gfx = makeGfx(['circle']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('classic'));
    const circle = gfx.querySelector('circle');
    expect(circle?.style.strokeWidth).toBe('4px');
    expect(circle?.style.stroke).toBe('#dc2626');
  });

  it('не утолщает иконку внутри завершающего события', () => {
    const gfx = makeGfx(['circle', 'path']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('classic'));
    const [border, icon] = gfx.querySelectorAll<SVGElement>('.djs-visual > *');
    expect(border?.style.strokeWidth).toBe('4px');
    expect(icon?.style.strokeWidth).toBe('');
  });

  it('не перекрывает ручную толщину завершающего события', () => {
    const gfx = makeGfx(['circle']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('classic'), { strokeWidth: '2' });
    expect(gfx.querySelector('circle')?.style.strokeWidth).toBe('');
  });
});
