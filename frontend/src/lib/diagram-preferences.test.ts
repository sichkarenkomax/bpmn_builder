import { describe, expect, it } from 'vitest';

import {
  clearDiagramPreferences,
  DIAGRAM_PREFERENCES_STORAGE_KEY,
  loadDiagramPreferences,
  saveDiagramPreference,
} from './diagram-preferences';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('пер-схемные настройки', () => {
  it('по умолчанию переопределений нет', () => {
    expect(loadDiagramPreferences('d1', memoryStorage())).toEqual({});
  });

  it('хранит переопределения отдельно для каждой схемы', () => {
    const storage = memoryStorage();
    saveDiagramPreference('d1', 'mouseMode', 'pan', storage);
    saveDiagramPreference('d2', 'validationMode', 'after-save', storage);

    expect(loadDiagramPreferences('d1', storage)).toEqual({ mouseMode: 'pan' });
    expect(loadDiagramPreferences('d2', storage)).toEqual({ validationMode: 'after-save' });
    expect(loadDiagramPreferences('d3', storage)).toEqual({});
  });

  it('undefined возвращает настройку к глобальной', () => {
    const storage = memoryStorage();
    saveDiagramPreference('d1', 'markdownToolbar', false, storage);
    saveDiagramPreference('d1', 'markdownToolbar', undefined, storage);
    expect(loadDiagramPreferences('d1', storage)).toEqual({});
    expect(storage.getItem(DIAGRAM_PREFERENCES_STORAGE_KEY)).toBeNull();
  });

  it('сброс убирает все переопределения схемы, не трогая соседние', () => {
    const storage = memoryStorage();
    saveDiagramPreference('d1', 'mouseMode', 'pan', storage);
    saveDiagramPreference('d1', 'typePalette', false, storage);
    saveDiagramPreference('d2', 'typePalette', false, storage);

    clearDiagramPreferences('d1', storage);

    expect(loadDiagramPreferences('d1', storage)).toEqual({});
    expect(loadDiagramPreferences('d2', storage)).toEqual({ typePalette: false });
  });

  it('битый JSON и пустой id не ломают чтение и запись', () => {
    const storage = memoryStorage({ [DIAGRAM_PREFERENCES_STORAGE_KEY]: '{oops' });
    expect(loadDiagramPreferences('d1', storage)).toEqual({});
    saveDiagramPreference('d1', 'mouseMode', 'pan', storage);
    expect(loadDiagramPreferences('d1', storage)).toEqual({ mouseMode: 'pan' });
    expect(loadDiagramPreferences('', storage)).toEqual({});
  });

  it('не падает без хранилища', () => {
    expect(loadDiagramPreferences('d1', null)).toEqual({});
    expect(() => saveDiagramPreference('d1', 'mouseMode', 'pan', null)).not.toThrow();
  });
});
