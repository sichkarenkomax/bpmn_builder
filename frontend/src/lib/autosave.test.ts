import { describe, expect, it } from 'vitest';

import {
  AUTOSAVE_DEFAULT_SECONDS,
  AUTOSAVE_MAX_SECONDS,
  AUTOSAVE_MIN_SECONDS,
  clampAutosaveSeconds,
  loadAutosaveSeconds,
  parseAutosaveSeconds,
  saveAutosaveSeconds,
} from './autosave';

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

describe('clampAutosaveSeconds', () => {
  it('округляет и держит период в допустимых границах', () => {
    expect(clampAutosaveSeconds(10)).toBe(10);
    expect(clampAutosaveSeconds(2.4)).toBe(AUTOSAVE_MIN_SECONDS);
    expect(clampAutosaveSeconds(1)).toBe(AUTOSAVE_MIN_SECONDS);
    expect(clampAutosaveSeconds(9999)).toBe(AUTOSAVE_MAX_SECONDS);
  });

  it('на мусоре возвращает значение по умолчанию', () => {
    expect(clampAutosaveSeconds(Number.NaN)).toBe(AUTOSAVE_DEFAULT_SECONDS);
    expect(clampAutosaveSeconds(Number.POSITIVE_INFINITY)).toBe(AUTOSAVE_DEFAULT_SECONDS);
  });
});

describe('parseAutosaveSeconds', () => {
  it('читает число из хранилища', () => {
    expect(parseAutosaveSeconds('25')).toBe(25);
  });

  it('не падает на пустом и нечисловом значении', () => {
    expect(parseAutosaveSeconds(null)).toBe(AUTOSAVE_DEFAULT_SECONDS);
    expect(parseAutosaveSeconds('abc')).toBe(AUTOSAVE_DEFAULT_SECONDS);
  });
});

describe('loadAutosaveSeconds / saveAutosaveSeconds', () => {
  it('сохраняет и читает период', () => {
    const storage = memoryStorage();
    expect(saveAutosaveSeconds(20, storage)).toBe(20);
    expect(loadAutosaveSeconds(storage)).toBe(20);
  });

  it('сохраняет уже нормализованное значение', () => {
    const storage = memoryStorage();
    expect(saveAutosaveSeconds(1, storage)).toBe(AUTOSAVE_MIN_SECONDS);
    expect(loadAutosaveSeconds(storage)).toBe(AUTOSAVE_MIN_SECONDS);
  });

  it('при отсутствии хранилища отдаёт значение по умолчанию', () => {
    expect(loadAutosaveSeconds(null)).toBe(AUTOSAVE_DEFAULT_SECONDS);
    expect(saveAutosaveSeconds(15, null)).toBe(15);
  });
});
