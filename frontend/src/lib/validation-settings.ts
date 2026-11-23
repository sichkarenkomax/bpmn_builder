/** Когда редактор проверяет схему: автоматически после сохранения или по кнопке. */

export type ValidationMode = 'after-save' | 'manual';

export const VALIDATION_MODE_STORAGE_KEY = 'bpmn-studio.validation-mode';
export const DEFAULT_VALIDATION_MODE: ValidationMode = 'after-save';

export function parseValidationMode(raw: string | null): ValidationMode {
  return raw === 'manual' ? 'manual' : DEFAULT_VALIDATION_MODE;
}

export function loadValidationMode(storage: Storage | null = safeStorage()): ValidationMode {
  if (!storage) {
    return DEFAULT_VALIDATION_MODE;
  }
  try {
    return parseValidationMode(storage.getItem(VALIDATION_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_VALIDATION_MODE;
  }
}

export function saveValidationMode(
  mode: ValidationMode,
  storage: Storage | null = safeStorage(),
): ValidationMode {
  if (storage) {
    try {
      storage.setItem(VALIDATION_MODE_STORAGE_KEY, mode);
    } catch {
      // Настройка не критична: приватный режим не должен ломать редактор.
    }
  }
  return mode;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}
