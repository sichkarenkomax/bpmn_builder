import { beforeEach, describe, expect, it } from 'vitest';

import {
  loadTypePaletteEnabled,
  saveTypePaletteEnabled,
  TYPE_PALETTE_DEFAULT,
  TYPE_PALETTE_STORAGE_KEY,
} from './type-palette';

describe('палитра смены типа (1.5.8)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('по умолчанию включена', () => {
    expect(loadTypePaletteEnabled()).toBe(TYPE_PALETTE_DEFAULT);
  });

  it('сохраняет выключенное состояние', () => {
    expect(saveTypePaletteEnabled(false)).toBe(false);
    expect(window.localStorage.getItem(TYPE_PALETTE_STORAGE_KEY)).toBe('false');
    expect(loadTypePaletteEnabled()).toBe(false);
  });

  it('битое значение не ломает редактор', () => {
    window.localStorage.setItem(TYPE_PALETTE_STORAGE_KEY, 'oops');
    expect(loadTypePaletteEnabled()).toBe(false);
  });
});
