/** Сохранённое положение и размер перетаскиваемых панелей холста. */

export type PanelLayout = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

export const PANEL_NAMES = ['problems', 'simulation', 'comments'] as const;
export type PanelName = (typeof PANEL_NAMES)[number];

const STORAGE_PREFIX = 'bpmn-studio.panel-layout.';

function storageKey(scope: string, name: string): string {
  return `${STORAGE_PREFIX}${scope}.${name}`;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positive(value: number | null): number | undefined {
  return value !== null && value > 0 ? value : undefined;
}

export function loadPanelLayout(scope: string, name: string): PanelLayout {
  try {
    const raw = window.localStorage.getItem(storageKey(scope, name));
    if (!raw) {
      return { x: 0, y: 0 };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { x: 0, y: 0 };
    }
    const record = parsed as Record<string, unknown>;
    const width = positive(toNumber(record.width));
    const height = positive(toNumber(record.height));
    return {
      x: toNumber(record.x) ?? 0,
      y: toNumber(record.y) ?? 0,
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    };
  } catch {
    return { x: 0, y: 0 };
  }
}

export function savePanelLayout(scope: string, name: string, layout: PanelLayout): PanelLayout {
  const saved: PanelLayout = {
    x: Math.round(layout.x),
    y: Math.round(layout.y),
  };
  if (layout.width !== undefined && layout.width > 0) {
    saved.width = Math.round(layout.width);
  }
  if (layout.height !== undefined && layout.height > 0) {
    saved.height = Math.round(layout.height);
  }
  try {
    window.localStorage.setItem(storageKey(scope, name), JSON.stringify(saved));
  } catch {
    // Приватный режим: положение панели просто не запомнится.
  }
  return saved;
}

export function clearPanelLayout(scope: string, name: string): void {
  try {
    window.localStorage.removeItem(storageKey(scope, name));
  } catch {
    // Приватный режим: удалять нечего.
  }
}

/** Автоположение возвращает все панели к раскладке по умолчанию. */
export function clearAllPanelLayouts(scope: string): void {
  for (const name of PANEL_NAMES) {
    clearPanelLayout(scope, name);
  }
}
