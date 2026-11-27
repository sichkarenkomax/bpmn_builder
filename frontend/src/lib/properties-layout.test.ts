import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PROPERTIES_LAYOUT,
  clearPropertiesLayout,
  dropPosition,
  loadPropertiesLayout,
  moveItem,
  normalizePropertiesLayout,
  reorderItem,
  reorderItemAt,
  savePropertiesLayout,
  toggleSectionCollapsed,
} from './properties-layout';

afterEach(() => {
  clearPropertiesLayout();
});

describe('раскладка свойств', () => {
  it('по умолчанию содержит все блоки и поля в исходном порядке', () => {
    expect(normalizePropertiesLayout(null)).toEqual({
      sections: [...DEFAULT_PROPERTIES_LAYOUT.sections],
      fields: [...DEFAULT_PROPERTIES_LAYOUT.fields],
      collapsed: [],
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

  it('ограничивает ширину панели и переживает сохранение', () => {
    const saved = savePropertiesLayout({
      sections: ['attributes', 'element'],
      fields: ['name'],
      collapsed: ['style'],
      width: 9999,
    });
    expect(saved.width).toBe(520);
    expect(saved.collapsed).toEqual(['style']);
    expect(loadPropertiesLayout()).toEqual(saved);
  });

  it('сохраняет только известные свёрнутые блоки без повторов', () => {
    const layout = normalizePropertiesLayout({
      collapsed: ['style', 'style', 'unknown', 'attributes'],
    });
    expect(layout.collapsed).toEqual(['style', 'attributes']);
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

  it('вставляет до и после цели', () => {
    expect(reorderItemAt(['a', 'b', 'c'], 'c', 'a', 'before')).toEqual(['c', 'a', 'b']);
    expect(reorderItemAt(['a', 'b', 'c'], 'a', 'b', 'after')).toEqual(['b', 'a', 'c']);
    expect(reorderItemAt(['a', 'b', 'c'], 'b', 'b', 'after')).toEqual(['a', 'b', 'c']);
  });
});

describe('сворачивание и позиция вставки', () => {
  it('переключает блок в свёрнутое состояние и обратно', () => {
    const collapsed = toggleSectionCollapsed(DEFAULT_PROPERTIES_LAYOUT, 'style');
    expect(collapsed.collapsed).toEqual(['style']);
    expect(toggleSectionCollapsed(collapsed, 'style').collapsed).toEqual([]);
  });

  it('делит блок пополам: верх — до, низ — после', () => {
    expect(dropPosition({ top: 100, height: 40 }, 110)).toBe('before');
    expect(dropPosition({ top: 100, height: 40 }, 130)).toBe('after');
  });
});
