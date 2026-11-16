// Переключатель Markdown-панели документации (задача 1.3.12) — настройка браузера.

export const MARKDOWN_TOOLBAR_STORAGE_KEY = 'bpmn-studio.markdown-toolbar';

export function parseMarkdownToolbarEnabled(raw: string | null): boolean {
  return raw !== 'false';
}

export function loadMarkdownToolbarEnabled(storage: Storage | null = safeStorage()): boolean {
  if (!storage) {
    return true;
  }
  try {
    return parseMarkdownToolbarEnabled(storage.getItem(MARKDOWN_TOOLBAR_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function saveMarkdownToolbarEnabled(
  enabled: boolean,
  storage: Storage | null = safeStorage(),
): boolean {
  if (storage) {
    try {
      storage.setItem(MARKDOWN_TOOLBAR_STORAGE_KEY, String(enabled));
    } catch {
      // Настройка — не критичные данные: приватный режим не должен ломать редактор.
    }
  }
  return enabled;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
}
