/**
 * Портальные значения по умолчанию для новых схем.
 *
 * До этапа 4 профиля пользователя нет, поэтому настройки живут в
 * `localStorage`. При создании диаграммы они записываются в `bs:*` её
 * `bpmn:definitions`: существующие схемы не меняются, а новые сразу
 * открываются с выбранными темой, холстом и правилами ресайза.
 */

import {
  DEFAULT_COMPACT_BOUNDARY_EVENTS,
  DEFAULT_RESIZE_OTHERS,
  DEFAULT_RESIZE_TASKS,
  diagramSettingsProperties,
  type CanvasTheme,
} from './diagram-settings';
import { normalizeThemeId, type ThemeId } from './diagram-theme';

export type PortalDefaults = {
  theme: ThemeId;
  canvas: CanvasTheme;
  resizeTasks: boolean;
  resizeOthers: boolean;
  compactBoundaryEvents: boolean;
};

export const PORTAL_DEFAULTS_STORAGE_KEY = 'bpmn-studio.portal-defaults';

/** URI расширения `bs` из bs-moddle.json: чужой namespace не сохраняется. */
const BS_NAMESPACE = 'https://bpmn-studio.dev/schema/1.0';

export const DEFAULT_PORTAL_SETTINGS: PortalDefaults = {
  theme: 'mono',
  canvas: 'light',
  resizeTasks: DEFAULT_RESIZE_TASKS,
  resizeOthers: DEFAULT_RESIZE_OTHERS,
  compactBoundaryEvents: DEFAULT_COMPACT_BOUNDARY_EVENTS,
};

export function loadPortalDefaults(): PortalDefaults {
  try {
    const raw = window.localStorage.getItem(PORTAL_DEFAULTS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PORTAL_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<PortalDefaults>;
    return {
      theme: normalizeThemeId(parsed.theme) ?? DEFAULT_PORTAL_SETTINGS.theme,
      canvas: parsed.canvas === 'dark' ? 'dark' : 'light',
      resizeTasks:
        typeof parsed.resizeTasks === 'boolean'
          ? parsed.resizeTasks
          : DEFAULT_PORTAL_SETTINGS.resizeTasks,
      resizeOthers:
        typeof parsed.resizeOthers === 'boolean'
          ? parsed.resizeOthers
          : DEFAULT_PORTAL_SETTINGS.resizeOthers,
      compactBoundaryEvents:
        typeof parsed.compactBoundaryEvents === 'boolean'
          ? parsed.compactBoundaryEvents
          : DEFAULT_PORTAL_SETTINGS.compactBoundaryEvents,
    };
  } catch {
    return DEFAULT_PORTAL_SETTINGS;
  }
}

export function savePortalDefaults(settings: PortalDefaults): void {
  try {
    window.localStorage.setItem(PORTAL_DEFAULTS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Приватный режим или переполнение: дефолты просто не сохранятся.
  }
}

/** Добавляет портальные настройки в XML новой схемы. */
export function withPortalDefaults(xml: string, settings = loadPortalDefaults()): string {
  const properties = diagramSettingsProperties({
    theme: settings.theme,
    canvas: settings.canvas,
    resizeTasks: settings.resizeTasks,
    resizeOthers: settings.resizeOthers,
    compactBoundaryEvents: settings.compactBoundaryEvents,
  });
  const attributes = Object.entries(properties)
    .filter(([, value]) => value !== undefined)
    .filter(([name]) => !xml.includes(`bs:${name}=`))
    .map(([name, value]) => `bs:${name}="${value}"`);
  if (attributes.length === 0) {
    return xml;
  }

  const needsNamespace = !xml.includes('xmlns:bs=');
  const additions = [...(needsNamespace ? [`xmlns:bs="${BS_NAMESPACE}"`] : []), ...attributes];
  return xml.replace(/<bpmn:definitions\b/, (tag) => `${tag} ${additions.join(' ')}`);
}
