export const AUTOSAVE_STORAGE_KEY = 'bpmn-studio.autosave';
export const AUTOSAVE_DEFAULT_SECONDS = 10;
export const AUTOSAVE_MIN_SECONDS = 2;
export const AUTOSAVE_MAX_SECONDS = 300;

/** Приводит период к допустимому целому числу секунд. */
export function clampAutosaveSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return AUTOSAVE_DEFAULT_SECONDS;
  }
  const rounded = Math.round(value);
  return Math.min(AUTOSAVE_MAX_SECONDS, Math.max(AUTOSAVE_MIN_SECONDS, rounded));
}

export function parseAutosaveSeconds(raw: string | null): number {
  if (raw === null) {
    return AUTOSAVE_DEFAULT_SECONDS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return AUTOSAVE_DEFAULT_SECONDS;
  }
  return clampAutosaveSeconds(parsed);
}

export function loadAutosaveSeconds(storage: Storage | null = safeStorage()): number {
  if (!storage) {
    return AUTOSAVE_DEFAULT_SECONDS;
  }
  try {
    return parseAutosaveSeconds(storage.getItem(AUTOSAVE_STORAGE_KEY));
  } catch {
    return AUTOSAVE_DEFAULT_SECONDS;
  }
}

export function saveAutosaveSeconds(
  seconds: number,
  storage: Storage | null = safeStorage(),
): number {
  const value = clampAutosaveSeconds(seconds);
  if (storage) {
    try {
      storage.setItem(AUTOSAVE_STORAGE_KEY, String(value));
    } catch {
      // Настройка — не критичные данные: приватный режим не должен ломать редактор.
    }
  }
  return value;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}
