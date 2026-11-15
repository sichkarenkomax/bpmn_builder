import { describe, expect, it } from 'vitest';

import {
  comboFromEvent,
  DEFAULT_SHORTCUTS,
  findConflict,
  formatCombo,
  matchesCombo,
  mergeShortcuts,
  normalizeCombo,
  validateCombo,
} from './shortcuts';

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('normalizeCombo', () => {
  it('приводит модификаторы к каноническому порядку', () => {
    expect(normalizeCombo('Shift + Ctrl + Z')).toBe('mod+shift+z');
    expect(normalizeCombo('⌘+S')).toBe('mod+s');
    expect(normalizeCombo('Option+F2')).toBe('alt+f2');
  });

  it('понимает псевдонимы служебных клавиш', () => {
    expect(normalizeCombo('Del')).toBe('delete');
    expect(normalizeCombo('Esc')).toBe('escape');
    expect(normalizeCombo('Ctrl++')).toBe('mod+=');
  });

  it('возвращает null, если клавиши нет или их две', () => {
    expect(normalizeCombo('Ctrl+Shift')).toBeNull();
    expect(normalizeCombo('Ctrl+A+B')).toBeNull();
    expect(normalizeCombo('')).toBeNull();
  });
});

describe('validateCombo', () => {
  it('требует модификатор для печатных клавиш', () => {
    expect(validateCombo('s')).toContain('модификатор');
    expect(validateCombo('mod+s')).toBeNull();
    expect(validateCombo('alt+1')).toBeNull();
  });

  it('разрешает функциональные и служебные клавиши без модификатора', () => {
    expect(validateCombo('f2')).toBeNull();
    expect(validateCombo('delete')).toBeNull();
    expect(validateCombo('space')).toBeNull();
  });
});

describe('comboFromEvent', () => {
  it('читает модификаторы и клавишу', () => {
    expect(comboFromEvent(keydown({ key: 'z', code: 'KeyZ', ctrlKey: true }))).toBe('mod+z');
    expect(comboFromEvent(keydown({ key: 'Z', code: 'KeyZ', metaKey: true, shiftKey: true }))).toBe(
      'mod+shift+z',
    );
    expect(comboFromEvent(keydown({ key: 'F2' }))).toBe('f2');
    expect(comboFromEvent(keydown({ key: 'Delete' }))).toBe('delete');
  });

  it('берёт физическую клавишу на нелатинской раскладке', () => {
    expect(comboFromEvent(keydown({ key: 'я', code: 'KeyZ', ctrlKey: true }))).toBe('mod+z');
  });

  it('нормализует плюс, чтобы работал зум на любой раскладке', () => {
    expect(
      comboFromEvent(keydown({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true })),
    ).toBe('mod+=');
  });

  it('игнорирует нажатие одних модификаторов', () => {
    expect(
      comboFromEvent(keydown({ key: 'Control', code: 'ControlLeft', ctrlKey: true })),
    ).toBeNull();
    expect(comboFromEvent(keydown({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toBeNull();
  });
});

describe('matchesCombo', () => {
  it('сравнивает событие с сохранённой комбинацией', () => {
    const event = keydown({ key: 's', code: 'KeyS', ctrlKey: true });
    expect(matchesCombo(event, 'mod+s')).toBe(true);
    expect(matchesCombo(event, 'Ctrl+S')).toBe(true);
    expect(matchesCombo(event, 'mod+shift+s')).toBe(false);
  });
});

describe('mergeShortcuts', () => {
  it('дополняет карту значениями по умолчанию', () => {
    expect(mergeShortcuts({ undo: 'mod+shift+z' }).undo).toBe('mod+shift+z');
    expect(mergeShortcuts({ undo: 'mod+shift+z' }).save).toBe(DEFAULT_SHORTCUTS.save);
  });

  it('игнорирует мусор и недопустимые комбинации', () => {
    const merged = mergeShortcuts({ undo: 'z', redo: 42, save: 'mod+shift+s' });
    expect(merged.undo).toBe(DEFAULT_SHORTCUTS.undo);
    expect(merged.redo).toBe(DEFAULT_SHORTCUTS.redo);
    expect(merged.save).toBe('mod+shift+s');
    expect(mergeShortcuts(null)).toEqual(DEFAULT_SHORTCUTS);
  });
});

describe('findConflict', () => {
  it('находит действие, занявшее комбинацию', () => {
    expect(findConflict(DEFAULT_SHORTCUTS, 'mod+z', 'redo')).toBe('undo');
    expect(findConflict(DEFAULT_SHORTCUTS, 'mod+z', 'undo')).toBeNull();
    expect(findConflict(DEFAULT_SHORTCUTS, 'Ctrl+Shift+K', 'undo')).toBeNull();
  });
});

describe('formatCombo', () => {
  it('рисует комбинацию для Windows/Linux и macOS', () => {
    expect(formatCombo('mod+shift+z', false)).toBe('Ctrl+Shift+Z');
    expect(formatCombo('mod+shift+z', true)).toBe('⌘ShiftZ');
    expect(formatCombo('delete', false)).toBe('Del');
  });
});
