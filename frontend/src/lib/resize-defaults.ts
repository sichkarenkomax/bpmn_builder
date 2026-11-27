/**
 * Глобальные значения «вида схемы»: какие элементы тянутся за ручки и
 * компактны ли граничные события.
 *
 * Схема хранит собственные значения в `bs:resize-tasks` и т.п. — атрибут
 * пишется только когда он отличается от значения по умолчанию. Поэтому схема
 * без атрибута следует за глобальными настройками, а изменённая вручную —
 * сохраняет свой выбор.
 */

import {
  DEFAULT_COMPACT_BOUNDARY_EVENTS,
  DEFAULT_RESIZE_OTHERS,
  DEFAULT_RESIZE_TASKS,
} from './diagram-settings';

export type ResizeDefaults = {
  tasks: boolean;
  others: boolean;
  compactBoundaryEvents: boolean;
};

export const RESIZE_DEFAULTS_STORAGE_KEY = 'bpmn-studio.resize-defaults';

export const DEFAULT_RESIZE_DEFAULTS: ResizeDefaults = {
  tasks: DEFAULT_RESIZE_TASKS,
  others: DEFAULT_RESIZE_OTHERS,
  compactBoundaryEvents: DEFAULT_COMPACT_BOUNDARY_EVENTS,
};

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

export function parseResizeDefaults(raw: string | null): ResizeDefaults {
  if (!raw) {
    return { ...DEFAULT_RESIZE_DEFAULTS };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_RESIZE_DEFAULTS };
    }
    const value = parsed as Partial<ResizeDefaults>;
    return {
      tasks: typeof value.tasks === 'boolean' ? value.tasks : DEFAULT_RESIZE_DEFAULTS.tasks,
      others: typeof value.others === 'boolean' ? value.others : DEFAULT_RESIZE_DEFAULTS.others,
      compactBoundaryEvents:
        typeof value.compactBoundaryEvents === 'boolean'
          ? value.compactBoundaryEvents
          : DEFAULT_RESIZE_DEFAULTS.compactBoundaryEvents,
    };
  } catch {
    return { ...DEFAULT_RESIZE_DEFAULTS };
  }
}

export function loadResizeDefaults(storage: Storage | null = safeStorage()): ResizeDefaults {
  if (!storage) {
    return { ...DEFAULT_RESIZE_DEFAULTS };
  }
  try {
    return parseResizeDefaults(storage.getItem(RESIZE_DEFAULTS_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_RESIZE_DEFAULTS };
  }
}

export function saveResizeDefaults(
  defaults: ResizeDefaults,
  storage: Storage | null = safeStorage(),
): ResizeDefaults {
  if (storage) {
    try {
      storage.setItem(RESIZE_DEFAULTS_STORAGE_KEY, JSON.stringify(defaults));
    } catch {
      // Приватный режим: настройка просто не сохранится.
    }
  }
  return defaults;
}
