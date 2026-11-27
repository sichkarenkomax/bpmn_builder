import { describe, expect, it } from 'vitest';

import {
  applyThemeToGfx,
  manualFill,
  manualStroke,
  themeById,
  themeForCanvas,
} from './diagram-theme';

const SVG_NS = 'http://www.w3.org/2000/svg';

// jsdom 31 нормализует hex-цвета в rgb(...) при записи в style.
function normalizedColor(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (!hex) {
    return value;
  }
  const number = Number.parseInt(hex[1] ?? '', 16);
  return `rgb(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255})`;
}

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
    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeById('colored'));
    const path = gfx.querySelector('path');
    expect(normalizedColor(path?.style.stroke)).toBe(normalizedColor('#000000'));
    expect(path?.style.strokeWidth).toBe('0.7');
  });

  it('не перекрывает ручную толщину линии связи', () => {
    const gfx = makeGfx(['path']);
    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeById('colored'), { strokeWidth: '2' });
    expect(gfx.querySelector('path')?.style.strokeWidth).toBe('2');

    const association = makeGfx(['path']);
    applyThemeToGfx(association, 'bpmn:Association', themeById('colored'), { strokeWidth: '2' });
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

    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeById('colored'));

    expect(normalizedColor(path.style.stroke)).toBe(normalizedColor('#000000'));
    expect(normalizedColor(path.style.fill)).toBe(normalizedColor('#000000'));
    expect(marker.getAttribute('markerUnits')).toBe('userSpaceOnUse');
    expect(marker.getAttribute('markerWidth')).toBe('12');
    expect(marker.getAttribute('markerHeight')).toBe('12');
  });

  it('даёт аннотации мягкий фон и красит только скобку', () => {
    const gfx = makeGfx(['rect', 'path']);
    applyThemeToGfx(gfx, 'bpmn:TextAnnotation', themeById('colored'));
    const [background, bracket] = gfx.querySelectorAll<SVGElement>('.djs-visual > *');
    expect(normalizedColor(background?.style.fill)).toBe(normalizedColor('#f8fafc'));
    expect(background?.style.stroke).toBe('none');
    expect(bracket?.style.fill).toBe('none');
    expect(normalizedColor(bracket?.style.stroke)).toBe(normalizedColor('#000000'));
  });

  it('рисует ассоциацию точками толщиной 1', () => {
    const gfx = makeGfx(['path']);
    applyThemeToGfx(gfx, 'bpmn:Association', themeById('colored'));
    const path = gfx.querySelector('path');
    expect(path?.style.strokeDasharray).toBe('0 6');
    expect(path?.style.strokeLinecap).toBe('round');
    expect(path?.style.strokeWidth).toBe('1');
  });

  it('красит старт в насыщенный зелёный, а финиш — в насыщенный красный', () => {
    const start = makeGfx(['circle']);
    applyThemeToGfx(start, 'bpmn:StartEvent', themeById('colored'));
    expect(normalizedColor(start.querySelector('circle')?.style.fill)).toBe(
      normalizedColor('#a7f3d0'),
    );

    const end = makeGfx(['circle']);
    applyThemeToGfx(end, 'bpmn:EndEvent', themeById('colored'));
    expect(normalizedColor(end.querySelector('circle')?.style.fill)).toBe(
      normalizedColor('#fecaca'),
    );
  });

  it('даёт завершающему событию толстую границу', () => {
    const gfx = makeGfx(['circle']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('colored'));
    const circle = gfx.querySelector('circle');
    expect(circle?.style.strokeWidth).toBe('4px');
    expect(normalizedColor(circle?.style.stroke)).toBe(normalizedColor('#000000'));
  });

  it('не утолщает иконку внутри завершающего события', () => {
    const gfx = makeGfx(['circle', 'path']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('colored'));
    const [border, icon] = gfx.querySelectorAll<SVGElement>('.djs-visual > *');
    expect(border?.style.strokeWidth).toBe('4px');
    expect(icon?.style.strokeWidth).toBe('');
  });

  it('не перекрывает ручную толщину завершающего события', () => {
    const gfx = makeGfx(['circle']);
    applyThemeToGfx(gfx, 'bpmn:EndEvent', themeById('colored'), { strokeWidth: '2' });
    expect(gfx.querySelector('circle')?.style.strokeWidth).toBe('');
  });

  it('не перекрашивает фигуры через корневую группу диаграммы', () => {
    const rootGfx = document.createElementNS(SVG_NS, 'g') as SVGGElement;
    const taskGfx = makeGfx(['rect']);
    rootGfx.append(taskGfx);
    const rect = taskGfx.querySelector('rect')!;
    rect.style.fill = '#22c55e';

    applyThemeToGfx(rootGfx, 'bpmn:Collaboration', themeById('colored'));

    expect(normalizedColor(rect.style.fill)).toBe(normalizedColor('#22c55e'));
  });

  it('читает ручной цвет в старом формате bioc', () => {
    const di = {
      get: (name: string) =>
        ({ 'bioc:fill': '#22c55e', 'bioc:stroke': '#166534' })[name] as string | undefined,
    };
    expect(manualFill(di)).toBe('#22c55e');
    expect(manualStroke(di)).toBe('#166534');
  });

  it('в чёрно-белой теме делает заливку белой, а границы чёрными', () => {
    const gfx = makeGfx(['rect']);
    applyThemeToGfx(gfx, 'bpmn:Task', themeById('mono'));
    const rect = gfx.querySelector('rect');
    expect(normalizedColor(rect?.style.fill)).toBe(normalizedColor('#ffffff'));
    expect(normalizedColor(rect?.style.stroke)).toBe(normalizedColor('#000000'));
  });

  it('на тёмном холсте даёт тёмную заливку и светлую границу', () => {
    const theme = themeForCanvas(themeById('colored'), 'dark');
    const gfx = makeGfx(['rect']);
    applyThemeToGfx(gfx, 'bpmn:Task', theme, { canvas: 'dark' });
    const rect = gfx.querySelector('rect');
    expect(normalizedColor(rect?.style.fill)).toBe(normalizedColor('#1e3a5f'));
    expect(normalizedColor(rect?.style.stroke)).toBe(normalizedColor('#93c5fd'));
  });

  it('на тёмном холсте делает стрелки и их наконечники светлыми', () => {
    const gfx = makeGfx([]);
    const visual = gfx.querySelector('.djs-visual');
    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    const markerPath = document.createElementNS(SVG_NS, 'path');
    marker.append(markerPath);
    defs.append(marker);
    const path = document.createElementNS(SVG_NS, 'path');
    visual?.append(path, defs);

    applyThemeToGfx(gfx, 'bpmn:SequenceFlow', themeForCanvas(themeById('mono'), 'dark'), {
      canvas: 'dark',
    });

    expect(normalizedColor(path.style.stroke)).toBe(normalizedColor('#dbe7f5'));
    expect(normalizedColor(markerPath.style.fill)).toBe(normalizedColor('#dbe7f5'));
  });
});
