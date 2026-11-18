import { describe, expect, it } from 'vitest';

import { safeFileStem, svgSize } from './export';

describe('svgSize', () => {
  it('берёт размеры из viewBox', () => {
    const size = svgSize(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" viewBox="0 0 300 150"></svg>',
    );

    expect(size).toEqual({ width: 300, height: 150 });
  });

  it('падает на width/height, если viewBox нет', () => {
    expect(
      svgSize('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"></svg>'),
    ).toEqual({ width: 640, height: 480 });
  });
});

describe('safeFileStem', () => {
  it('убирает опасные для файловой системы символы', () => {
    expect(safeFileStem('  Схема: закупка / 2026  ')).toBe('Схема-закупка-2026');
  });

  it('не возвращает пустое имя', () => {
    expect(safeFileStem('***')).toBe('diagram');
  });
});
