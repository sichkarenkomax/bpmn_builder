import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RESIZE_DEFAULTS,
  loadResizeDefaults,
  parseResizeDefaults,
  saveResizeDefaults,
} from './resize-defaults';

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

describe('глобальные настройки вида схемы', () => {
  it('по умолчанию задачи тянутся, остальные — нет', () => {
    expect(loadResizeDefaults(memoryStorage())).toEqual(DEFAULT_RESIZE_DEFAULTS);
    expect(DEFAULT_RESIZE_DEFAULTS).toEqual({
      tasks: true,
      others: false,
      compactBoundaryEvents: false,
    });
  });

  it('сохраняет и читает значения', () => {
    const storage = memoryStorage();
    saveResizeDefaults({ tasks: false, others: true, compactBoundaryEvents: true }, storage);
    expect(loadResizeDefaults(storage)).toEqual({
      tasks: false,
      others: true,
      compactBoundaryEvents: true,
    });
  });

  it('битое значение и пропуски заменяются дефолтами', () => {
    expect(parseResizeDefaults('{oops')).toEqual(DEFAULT_RESIZE_DEFAULTS);
    expect(parseResizeDefaults(JSON.stringify({ others: true }))).toEqual({
      tasks: DEFAULT_RESIZE_DEFAULTS.tasks,
      others: true,
      compactBoundaryEvents: DEFAULT_RESIZE_DEFAULTS.compactBoundaryEvents,
    });
  });
});
