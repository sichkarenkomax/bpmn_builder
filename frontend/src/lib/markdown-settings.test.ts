import { describe, expect, it } from 'vitest';

import {
  loadMarkdownToolbarEnabled,
  parseMarkdownToolbarEnabled,
  saveMarkdownToolbarEnabled,
} from './markdown-settings';

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

describe('markdown-settings', () => {
  it('по умолчанию панель включена', () => {
    expect(loadMarkdownToolbarEnabled(memoryStorage())).toBe(true);
    expect(loadMarkdownToolbarEnabled(null)).toBe(true);
  });

  it('выключение сохраняется и читается обратно', () => {
    const storage = memoryStorage();
    expect(saveMarkdownToolbarEnabled(false, storage)).toBe(false);
    expect(storage.getItem('bpmn-studio.markdown-toolbar')).toBe('false');
    expect(loadMarkdownToolbarEnabled(storage)).toBe(false);
  });

  it('битое значение трактуется как включено', () => {
    expect(parseMarkdownToolbarEnabled('garbage')).toBe(true);
    expect(parseMarkdownToolbarEnabled(null)).toBe(true);
    expect(parseMarkdownToolbarEnabled('false')).toBe(false);
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
    expect(loadMarkdownToolbarEnabled(broken)).toBe(true);
    expect(saveMarkdownToolbarEnabled(false, broken)).toBe(false);
  });
});
