export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bpmn-studio.theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

/** Сохранённая тема важнее системной настройки; мусор в хранилище игнорируем. */
export function resolveTheme(stored: unknown, prefersDark: boolean): Theme {
  if (isTheme(stored)) {
    return stored;
  }
  return prefersDark ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, root: HTMLElement): void {
  root.dataset['theme'] = theme;
}

export function nextTheme(current: Theme): Theme {
  return current === 'light' ? 'dark' : 'light';
}

export function loadTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  return resolveTheme(stored, prefersDark);
}

export function saveTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}
