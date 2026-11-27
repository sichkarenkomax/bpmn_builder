export const SHORTCUTS_STORAGE_KEY = 'bpmn-studio.shortcuts';

export type ShortcutAction =
  | 'save'
  | 'validate'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'cut'
  | 'delete'
  | 'selectAll'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'toggleMinimap'
  | 'editLabel'
  | 'changeType'
  | 'toggleDefaultFlow'
  | 'settings';

export type ShortcutGroup = 'Файл' | 'Правка' | 'Вид' | 'Элемент';

export interface ShortcutDefinition {
  action: ShortcutAction;
  label: string;
  group: ShortcutGroup;
  combo: string;
}

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  { action: 'save', label: 'Сохранить', group: 'Файл', combo: 'mod+s' },
  { action: 'validate', label: 'Проверить схему', group: 'Файл', combo: 'mod+shift+v' },
  { action: 'undo', label: 'Отменить', group: 'Правка', combo: 'mod+z' },
  { action: 'redo', label: 'Повторить', group: 'Правка', combo: 'mod+y' },
  { action: 'copy', label: 'Копировать', group: 'Правка', combo: 'mod+c' },
  { action: 'paste', label: 'Вставить', group: 'Правка', combo: 'mod+v' },
  { action: 'duplicate', label: 'Дублировать', group: 'Правка', combo: 'mod+d' },
  { action: 'cut', label: 'Вырезать', group: 'Правка', combo: 'mod+x' },
  { action: 'delete', label: 'Удалить', group: 'Правка', combo: 'delete' },
  { action: 'selectAll', label: 'Выделить всё', group: 'Правка', combo: 'mod+a' },
  { action: 'zoomIn', label: 'Приблизить', group: 'Вид', combo: 'mod+=' },
  { action: 'zoomOut', label: 'Отдалить', group: 'Вид', combo: 'mod+-' },
  { action: 'fit', label: 'Вписать диаграмму', group: 'Вид', combo: 'mod+0' },
  { action: 'toggleMinimap', label: 'Мини-карта', group: 'Вид', combo: 'mod+m' },
  { action: 'editLabel', label: 'Редактировать название', group: 'Элемент', combo: 'f2' },
  { action: 'changeType', label: 'Сменить тип элемента', group: 'Элемент', combo: 'r' },
  {
    action: 'toggleDefaultFlow',
    label: 'Поток по умолчанию',
    group: 'Элемент',
    combo: 'shift+d',
  },
  { action: 'settings', label: 'Настройки', group: 'Вид', combo: 'mod+/' },
];

export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((definition) => [definition.action, definition.combo]),
) as ShortcutMap;

/**
 * Комбинации, которые bpmn-js перехватывает сам. Их надо «глотать», если
 * пользователь переназначил действие на другую клавишу.
 */
export const EDITOR_BUILTIN_COMBOS: Partial<Record<ShortcutAction, string>> = {
  undo: 'mod+z',
  redo: 'mod+y',
  copy: 'mod+c',
  paste: 'mod+v',
  duplicate: 'mod+d',
  cut: 'mod+x',
  delete: 'delete',
  selectAll: 'mod+a',
  zoomIn: 'mod+=',
  zoomOut: 'mod+-',
};

const MODIFIER_ORDER = ['mod', 'alt', 'shift'] as const;

const KEY_ALIASES: Record<string, string> = {
  ctrl: 'mod',
  control: 'mod',
  cmd: 'mod',
  command: 'mod',
  meta: 'mod',
  '⌘': 'mod',
  '⌃': 'mod',
  option: 'alt',
  opt: 'alt',
  alt: 'alt',
  shift: 'shift',
  del: 'delete',
  delete: 'delete',
  esc: 'escape',
  escape: 'escape',
  space: 'space',
  spacebar: 'space',
  ' ': 'space',
  enter: 'enter',
  return: 'enter',
  backspace: 'backspace',
  tab: 'tab',
  plus: '=',
  '+': '=',
  minus: '-',
};

const KEY_LABELS: Record<string, string> = {
  delete: 'Del',
  escape: 'Esc',
  space: 'Space',
  enter: 'Enter',
  backspace: 'Backspace',
  tab: 'Tab',
  '=': '+',
  '-': '−',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

function normalizeKeyToken(token: string): string {
  const lowered = token.trim().toLowerCase();
  return KEY_ALIASES[lowered] ?? lowered;
}

/** Приводит «Ctrl + Shift + Z» к каноническому виду «mod+shift+z». */
export function normalizeCombo(input: string): string | null {
  // «Ctrl++»: завершающий плюс — это сама клавиша, а не разделитель.
  const source = input.trim().endsWith('++') ? `${input.trim().slice(0, -1)}plus` : input;
  const raw = source
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== '+');

  if (raw.length === 0) {
    return null;
  }

  const modifiers = new Set<string>();
  let key: string | null = null;

  for (const token of raw) {
    const normalized = normalizeKeyToken(token);
    if ((MODIFIER_ORDER as readonly string[]).includes(normalized)) {
      modifiers.add(normalized);
      continue;
    }
    if (key !== null) {
      // Второй не-модификатор — это уже не комбинация клавиш.
      return null;
    }
    key = normalized;
  }

  if (key === null) {
    return null;
  }

  const parts = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  return [...parts, key].join('+');
}

/** Ошибка валидации или null, если комбинация допустима. */
export function validateCombo(combo: string): string | null {
  const normalized = normalizeCombo(combo);
  if (!normalized) {
    return 'Нужна клавиша или комбинация клавиш';
  }
  const parts = normalized.split('+');
  const key = parts[parts.length - 1] ?? '';
  const hasModifier = parts.some((part) => part !== key);
  const isFunctionKey = /^f([1-9]|1[0-2])$/.test(key);
  const isNamedKey = [
    'delete',
    'escape',
    'space',
    'enter',
    'backspace',
    'tab',
    'insert',
    'home',
    'end',
  ].includes(key);

  if (!hasModifier && !isFunctionKey && !isNamedKey) {
    return 'Без модификатора можно только F1–F12 и служебные клавиши';
  }
  return null;
}

/** Комбинация из события клавиатуры; null для нажатий одних модификаторов. */
export function comboFromEvent(event: KeyboardEvent): string | null {
  if (['Control', 'Meta', 'Shift', 'Alt', 'AltGraph'].includes(event.key)) {
    return null;
  }

  let key: string | null;
  let shift = event.shiftKey;

  const letterCode = /^Key([A-Z])$/.exec(event.code);
  const digitCode = /^Digit([0-9])$/.exec(event.code);

  if (event.key === '+') {
    key = '=';
    shift = false;
  } else if (letterCode) {
    key = (letterCode[1] ?? '').toLowerCase();
  } else if (digitCode) {
    key = digitCode[1] ?? null;
  } else if (event.key.length === 1) {
    key = event.key.toLowerCase();
  } else {
    key = normalizeKeyToken(event.key);
  }

  if (!key) {
    return null;
  }

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) {
    parts.push('mod');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (shift) {
    parts.push('shift');
  }
  parts.push(key);
  return parts.join('+');
}

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const normalized = normalizeCombo(combo);
  return normalized !== null && comboFromEvent(event) === normalized;
}

export function formatCombo(combo: string, mac = isMacPlatform()): string {
  const normalized = normalizeCombo(combo);
  if (!normalized) {
    return '—';
  }
  return normalized
    .split('+')
    .map((part) => {
      if (part === 'mod') {
        return mac ? '⌘' : 'Ctrl';
      }
      if (part === 'alt') {
        return mac ? '⌥' : 'Alt';
      }
      if (part === 'shift') {
        return 'Shift';
      }
      return KEY_LABELS[part] ?? part.toUpperCase();
    })
    .join(mac ? '' : '+');
}

/** Приводит произвольное содержимое localStorage к полной карте сокращений. */
export function mergeShortcuts(stored: unknown): ShortcutMap {
  const result: ShortcutMap = { ...DEFAULT_SHORTCUTS };
  if (!stored || typeof stored !== 'object') {
    return result;
  }
  const source = stored as Record<string, unknown>;
  for (const definition of SHORTCUT_DEFINITIONS) {
    const value = source[definition.action];
    if (typeof value !== 'string') {
      continue;
    }
    if (validateCombo(value) !== null) {
      continue;
    }
    const normalized = normalizeCombo(value);
    if (normalized) {
      result[definition.action] = normalized;
    }
  }
  return result;
}

export function loadShortcuts(): ShortcutMap {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_SHORTCUTS };
  }
  try {
    return mergeShortcuts(JSON.parse(window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function saveShortcuts(shortcuts: ShortcutMap): void {
  window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
}

/** Действие, у которого уже занята эта комбинация. */
export function findConflict(
  shortcuts: ShortcutMap,
  combo: string,
  except: ShortcutAction,
): ShortcutAction | null {
  const normalized = normalizeCombo(combo);
  if (!normalized) {
    return null;
  }
  for (const [action, value] of Object.entries(shortcuts) as [ShortcutAction, string][]) {
    if (action !== except && normalizeCombo(value) === normalized) {
      return action;
    }
  }
  return null;
}

export function describeAction(action: ShortcutAction): string {
  return SHORTCUT_DEFINITIONS.find((definition) => definition.action === action)?.label ?? action;
}
