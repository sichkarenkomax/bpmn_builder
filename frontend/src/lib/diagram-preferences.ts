/**
 * Настройки поведения, переопределённые для конкретной схемы.
 *
 * Глобальные значения (автосохранение, проверка, Markdown-панель, палитра
 * типов, кнопка мыши) лежат в отдельных ключах `bpmn-studio.*` и действуют на
 * все схемы. Если пользователь меняет настройку в редакторе, значение
 * сохраняется здесь и перекрывает глобальное только для этой диаграммы.
 */

import type { CanvasMouseMode } from './mouse-settings';
import type { ValidationMode } from './validation-settings';

export type BehaviorSettings = {
  autosaveSeconds: number;
  validationMode: ValidationMode;
  markdownToolbar: boolean;
  typePalette: boolean;
  mouseMode: CanvasMouseMode;
};

export type BehaviorPreferenceKey = keyof BehaviorSettings;
export type BehaviorPreferences = Partial<BehaviorSettings>;

export const DIAGRAM_PREFERENCES_STORAGE_KEY = 'bpmn-studio.schema-settings';

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}

function readAll(storage: Storage | null): Record<string, BehaviorPreferences> {
  if (!storage) {
    return {};
  }
  try {
    const raw = storage.getItem(DIAGRAM_PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, BehaviorPreferences> = {};
    for (const [diagramId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[diagramId] = sanitize(value as BehaviorPreferences);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function sanitize(value: BehaviorPreferences): BehaviorPreferences {
  const result: BehaviorPreferences = {};
  if (typeof value.autosaveSeconds === 'number' && Number.isFinite(value.autosaveSeconds)) {
    result.autosaveSeconds = value.autosaveSeconds;
  }
  if (value.validationMode === 'manual' || value.validationMode === 'after-save') {
    result.validationMode = value.validationMode;
  }
  if (typeof value.markdownToolbar === 'boolean') {
    result.markdownToolbar = value.markdownToolbar;
  }
  if (typeof value.typePalette === 'boolean') {
    result.typePalette = value.typePalette;
  }
  if (value.mouseMode === 'select' || value.mouseMode === 'pan') {
    result.mouseMode = value.mouseMode;
  }
  return result;
}

function writeAll(storage: Storage | null, all: Record<string, BehaviorPreferences>): void {
  if (!storage) {
    return;
  }
  try {
    if (Object.keys(all).length === 0) {
      storage.removeItem(DIAGRAM_PREFERENCES_STORAGE_KEY);
      return;
    }
    storage.setItem(DIAGRAM_PREFERENCES_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Приватный режим: настройка просто не сохранится.
  }
}

/** Переопределения схемы; пустой объект означает «как в глобальных». */
export function loadDiagramPreferences(
  diagramId: string,
  storage: Storage | null = safeStorage(),
): BehaviorPreferences {
  if (!diagramId) {
    return {};
  }
  return readAll(storage)[diagramId] ?? {};
}

/** Пишет переопределение; `undefined` возвращает настройку к глобальной. */
export function saveDiagramPreference<K extends BehaviorPreferenceKey>(
  diagramId: string,
  key: K,
  value: BehaviorSettings[K] | undefined,
  storage: Storage | null = safeStorage(),
): void {
  if (!diagramId) {
    return;
  }
  const all = readAll(storage);
  const next: BehaviorPreferences = { ...all[diagramId] };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  if (Object.keys(next).length === 0) {
    delete all[diagramId];
  } else {
    all[diagramId] = next;
  }
  writeAll(storage, all);
}

/** Убирает все переопределения схемы. */
export function clearDiagramPreferences(
  diagramId: string,
  storage: Storage | null = safeStorage(),
): void {
  if (!diagramId) {
    return;
  }
  const all = readAll(storage);
  if (!(diagramId in all)) {
    return;
  }
  delete all[diagramId];
  writeAll(storage, all);
}
