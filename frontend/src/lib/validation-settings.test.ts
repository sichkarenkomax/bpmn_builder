import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VALIDATION_MODE,
  loadValidationMode,
  parseValidationMode,
  saveValidationMode,
} from './validation-settings';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: () => null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('validation-settings', () => {
  it('по умолчанию проверяет после сохранения', () => {
    expect(loadValidationMode(memoryStorage())).toBe(DEFAULT_VALIDATION_MODE);
    expect(loadValidationMode(null)).toBe(DEFAULT_VALIDATION_MODE);
    expect(parseValidationMode(null)).toBe(DEFAULT_VALIDATION_MODE);
    expect(parseValidationMode('garbage')).toBe(DEFAULT_VALIDATION_MODE);
    // Явно сохранённый авторежим не должен подменяться дефолтом.
    expect(parseValidationMode('after-save')).toBe('after-save');
  });

  it('режим «только по требованию» сохраняется и читается обратно', () => {
    const storage = memoryStorage();
    expect(saveValidationMode('manual', storage)).toBe('manual');
    expect(storage.getItem('bpmn-studio.validation-mode')).toBe('manual');
    expect(loadValidationMode(storage)).toBe('manual');
  });

  it('броски хранилища не ломают редактор', () => {
    const broken = {
      getItem: () => {
        throw new Error('readonly');
      },
      setItem: () => {
        throw new Error('readonly');
      },
    } as unknown as Storage;
    expect(loadValidationMode(broken)).toBe(DEFAULT_VALIDATION_MODE);
    expect(saveValidationMode('manual', broken)).toBe('manual');
  });
});
