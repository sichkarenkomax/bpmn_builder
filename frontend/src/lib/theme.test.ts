import { describe, expect, it } from 'vitest';

import { applyTheme, isTheme, nextTheme, resolveTheme, THEME_STORAGE_KEY } from './theme';

describe('resolveTheme', () => {
  it('предпочитает сохранённую тему системной', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('падает на системную настройку, если сохранённой нет или она мусор', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('black', false)).toBe('light');
    expect(resolveTheme(42, true)).toBe('dark');
  });
});

describe('isTheme', () => {
  it('пропускает только допустимые значения', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('')).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe('applyTheme', () => {
  it('проставляет data-theme на корневой элемент', () => {
    const root = document.createElement('html');

    applyTheme('dark', root);

    expect(root.dataset['theme']).toBe('dark');
  });
});

describe('nextTheme', () => {
  it('переключает тему в обе стороны', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('light');
  });
});

describe('ключ хранилища', () => {
  it('не меняется случайно — он общий для вкладок', () => {
    expect(THEME_STORAGE_KEY).toBe('bpmn-studio.theme');
  });
});
