export interface ColorSwatch {
  name: string;
  value: string;
}

export interface ElementStyle {
  fill?: string;
  stroke?: string;
}

export const STYLE_DEFAULTS_STORAGE_KEY = 'bpmn-studio.default-style';

export const FILL_SWATCHES: readonly ColorSwatch[] = [
  { name: 'Белый', value: '#ffffff' },
  { name: 'Светло-серый', value: '#eef1f5' },
  { name: 'Голубой', value: '#dbeafe' },
  { name: 'Зелёный', value: '#dcfce7' },
  { name: 'Жёлтый', value: '#fef3c7' },
  { name: 'Оранжевый', value: '#ffedd5' },
  { name: 'Красный', value: '#fee2e2' },
  { name: 'Сиреневый', value: '#ede9fe' },
];

export const STROKE_SWATCHES: readonly ColorSwatch[] = [
  { name: 'Тёмный', value: '#22242a' },
  { name: 'Синий', value: '#2f6feb' },
  { name: 'Зелёный', value: '#1f8a4c' },
  { name: 'Оранжевый', value: '#b45309' },
  { name: 'Красный', value: '#c0392b' },
  { name: 'Сиреневый', value: '#6b21a8' },
];

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_PATTERN.test(value);
}

/** Стиль по умолчанию хранится по полному типу BPMN, например `bpmn:UserTask`. */
export type StyleDefaults = Record<string, ElementStyle>;

function sanitizeStyle(raw: unknown): ElementStyle {
  if (raw === null || typeof raw !== 'object') {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const style: ElementStyle = {};
  if (isHexColor(record['fill'])) {
    style.fill = record['fill'].toLowerCase();
  }
  if (isHexColor(record['stroke'])) {
    style.stroke = record['stroke'].toLowerCase();
  }
  return style;
}

export function parseStyleDefaults(raw: string | null): StyleDefaults {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return {};
    }
    const result: StyleDefaults = {};
    for (const [type, value] of Object.entries(parsed as Record<string, unknown>)) {
      const style = sanitizeStyle(value);
      if (style.fill || style.stroke) {
        result[type] = style;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getDefaultStyle(
  defaults: StyleDefaults,
  elementType: string,
): ElementStyle | undefined {
  return defaults[elementType];
}

export function withDefaultStyle(
  defaults: StyleDefaults,
  elementType: string,
  style: ElementStyle,
): StyleDefaults {
  const clean = sanitizeStyle(style);
  const next = { ...defaults };
  if (clean.fill || clean.stroke) {
    next[elementType] = clean;
  } else {
    delete next[elementType];
  }
  return next;
}

export function clearDefaultStyle(defaults: StyleDefaults, elementType: string): StyleDefaults {
  const next = { ...defaults };
  delete next[elementType];
  return next;
}

export function styleLabel(style: ElementStyle): string {
  const parts: string[] = [];
  if (style.fill) {
    parts.push(`заливка ${style.fill}`);
  }
  if (style.stroke) {
    parts.push(`обводка ${style.stroke}`);
  }
  return parts.join(', ');
}

export function loadStyleDefaults(storage: Storage | null = safeStorage()): StyleDefaults {
  if (!storage) {
    return {};
  }
  try {
    return parseStyleDefaults(storage.getItem(STYLE_DEFAULTS_STORAGE_KEY));
  } catch {
    return {};
  }
}

export function saveStyleDefaults(
  defaults: StyleDefaults,
  storage: Storage | null = safeStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STYLE_DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));
  } catch {
    // Настройка не критична: приватный режим не должен ломать редактор.
  }
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}
