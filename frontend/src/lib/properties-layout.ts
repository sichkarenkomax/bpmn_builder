/** Раскладка панели свойств конкретного пользователя (1.5.19). */

export type PropertiesSectionId =
  'element' | 'stages' | 'style' | 'attributes' | 'assignee' | 'script' | 'flow' | 'behavior';

export type PropertiesFieldId = 'name' | 'id' | 'type' | 'documentation';

export type PropertiesLayout = {
  sections: PropertiesSectionId[];
  fields: PropertiesFieldId[];
  width?: number;
  height?: number;
};

export const PROPERTIES_SECTIONS: { id: PropertiesSectionId; label: string }[] = [
  { id: 'element', label: 'Элемент' },
  { id: 'stages', label: 'Этапы' },
  { id: 'style', label: 'Стиль' },
  { id: 'attributes', label: 'Атрибуты' },
  { id: 'assignee', label: 'Исполнитель' },
  { id: 'script', label: 'Скрипт' },
  { id: 'flow', label: 'Поток' },
  { id: 'behavior', label: 'Поведение' },
];

export const PROPERTIES_FIELDS: { id: PropertiesFieldId; label: string }[] = [
  { id: 'name', label: 'Название' },
  { id: 'id', label: 'ID' },
  { id: 'type', label: 'Тип' },
  { id: 'documentation', label: 'Документация' },
];

export const MIN_PROPERTIES_WIDTH = 240;
export const MAX_PROPERTIES_WIDTH = 520;
export const MIN_PROPERTIES_HEIGHT = 320;

const STORAGE_KEY = 'bpmn-studio.properties-layout.v1';

export const DEFAULT_PROPERTIES_LAYOUT: PropertiesLayout = {
  sections: PROPERTIES_SECTIONS.map((item) => item.id),
  fields: PROPERTIES_FIELDS.map((item) => item.id),
};

function normalizeIds<T extends string>(raw: unknown, allowed: readonly T[], fallback: T[]): T[] {
  const result: T[] = [];
  if (Array.isArray(raw)) {
    for (const value of raw) {
      if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
        const id = value as T;
        if (!result.includes(id)) {
          result.push(id);
        }
      }
    }
  }
  for (const id of fallback) {
    if (!result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

function clamp(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(Math.min(max, Math.max(min, value)));
}

/** Приводит сохранённое значение к известным блокам и полям, не теряя новых. */
export function normalizePropertiesLayout(raw: unknown): PropertiesLayout {
  if (!raw || typeof raw !== 'object') {
    return {
      sections: [...DEFAULT_PROPERTIES_LAYOUT.sections],
      fields: [...DEFAULT_PROPERTIES_LAYOUT.fields],
    };
  }
  const record = raw as Record<string, unknown>;
  const sections = normalizeIds(
    record.sections,
    PROPERTIES_SECTIONS.map((item) => item.id),
    DEFAULT_PROPERTIES_LAYOUT.sections,
  );
  const fields = normalizeIds(
    record.fields,
    PROPERTIES_FIELDS.map((item) => item.id),
    DEFAULT_PROPERTIES_LAYOUT.fields,
  );
  const width = clamp(record.width, MIN_PROPERTIES_WIDTH, MAX_PROPERTIES_WIDTH);
  const height = clamp(record.height, MIN_PROPERTIES_HEIGHT, Number.MAX_SAFE_INTEGER);
  return {
    sections,
    fields,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  };
}

export function loadPropertiesLayout(): PropertiesLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizePropertiesLayout(JSON.parse(raw)) : normalizePropertiesLayout(null);
  } catch {
    return normalizePropertiesLayout(null);
  }
}

export function savePropertiesLayout(layout: PropertiesLayout): PropertiesLayout {
  const saved = normalizePropertiesLayout(layout);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Приватный режим: раскладка просто не запомнится.
  }
  return saved;
}

export function clearPropertiesLayout(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Приватный режим: удалять нечего.
  }
}

/** Меняет местами элемент по индексу `from` с соседом в направлении `delta`. */
export function moveItem<T>(items: T[], from: number, delta: number): T[] {
  const to = from + delta;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Переставляет `dragged` на место `target`, сохраняя остальной порядок. */
export function reorderItem<T>(items: T[], dragged: T, target: T): T[] {
  const from = items.indexOf(dragged);
  const to = items.indexOf(target);
  if (from === -1 || to === -1 || from === to) {
    return items;
  }
  const next = [...items];
  next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}
