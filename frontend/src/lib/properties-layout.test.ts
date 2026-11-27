import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PROPERTIES_LAYOUT,
  clearPropertiesLayout,
  loadPropertiesLayout,
  moveItem,
  normalizePropertiesLayout,
  reorderItem,
  savePropertiesLayout,
} from './properties-layout';

afterEach(() => {
  clearPropertiesLayout();
});

describe('раскладка свойств', () => {
  it('по умолчанию содержит все блоки и поля в исходном порядке', () => {
    expect(normalizePropertiesLayout(null)).toEqual({
      sections: [...DEFAULT_PROPERTIES_LAYOUT.sections],
      fields: [...DEFAULT_PROPERTIES_LAYOUT.fields],
    });
  });

  it('убирает неизвестные и повторные id, добавляя недостающие в конец', () => {
    const layout = normalizePropertiesLayout({
      sections: ['style', 'style', 'unknown', 'element'],
      fields: ['documentation'],
    });
    expect(layout.sections).toEqual([
      'style',
      'element',
      'stages',
      'attributes',
      'assignee',
      'script',
      'flow',
      'behavior',
    ]);
    expect(layout.fields).toEqual(['documentation', 'name', 'id', 'type']);
    expect(layout.width).toBeUndefined();
  });

  it('ограничивает размер панели и переживает сохранение', () => {
    const saved = savePropertiesLayout({
      sections: ['attributes', 'element'],
      fields: ['name'],
      width: 9999,
      height: 10,
    });
    expect(saved.width).toBe(520);
    expect(saved.height).toBe(320);
    expect(loadPropertiesLayout()).toEqual(saved);
  });

  it('игнорирует испорченное значение в localStorage', () => {
    window.localStorage.setItem('bpmn-studio.properties-layout.v1', '{не json');
    expect(loadPropertiesLayout().sections).toEqual(DEFAULT_PROPERTIES_LAYOUT.sections);
  });
});

describe('перестановка', () => {
  it('двигает элемент на соседнюю позицию', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
  });

  it('ставит перетащенный элемент на место цели', () => {
    expect(reorderItem(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(reorderItem(['a', 'b'], 'a', 'a')).toEqual(['a', 'b']);
  });
});
