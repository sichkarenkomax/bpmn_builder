/** Настройки схемы, которые живут в самом документе (`bs:*` на `bpmn:definitions`). */

import {
  isThemeId,
  parseCustomTheme,
  serializeCustomTheme,
  type ThemeColorsMap,
  type ThemeId,
} from './diagram-theme';

export type LegendPosition = { x: number; y: number };
export type CanvasTheme = 'light' | 'dark';

export type DiagramSettings = {
  theme: ThemeId | null;
  legend: LegendPosition | null;
  customColors: ThemeColorsMap | null;
  canvas: CanvasTheme;
};

/** Минимальная форма `bpmn:Definitions` от moddle: прямые свойства и `$attrs`. */
export type DefinitionsLike = {
  $attrs?: Record<string, string>;
  [key: string]: unknown;
};

/** Правее палитры bpmn-js (~96 px), чтобы блок не лёг поверх неё. */
export const DEFAULT_LEGEND_POSITION: LegendPosition = { x: 120, y: 16 };

function attribute(
  definitions: DefinitionsLike | undefined,
  property: string,
  alias: string,
): string | undefined {
  const fromAttrs = definitions?.$attrs?.[`bs:${alias}`];
  if (typeof fromAttrs === 'string' && fromAttrs !== '') {
    return fromAttrs;
  }
  // В ручном XML значение может оказаться и прямым свойством — читаем оба.
  const direct = definitions?.[property];
  return typeof direct === 'string' && direct !== '' ? direct : undefined;
}

export function readDiagramSettings(definitions: DefinitionsLike | undefined): DiagramSettings {
  const theme = attribute(definitions, 'theme', 'theme');
  const x = Number(attribute(definitions, 'legend-x', 'legend-x'));
  const y = Number(attribute(definitions, 'legend-y', 'legend-y'));
  const canvas = attribute(definitions, 'canvas', 'canvas');

  return {
    theme: isThemeId(theme) ? theme : null,
    legend: Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null,
    // `bs:custom-theme` — JSON в атрибуте; битый атрибут не ломает открытие.
    customColors: parseCustomTheme(attribute(definitions, 'custom-theme', 'custom-theme')),
    canvas: canvas === 'dark' ? 'dark' : 'light',
  };
}

/** Свойства документа; `undefined` удаляет соответствующий `bs:*`-атрибут. */
export function diagramSettingsProperties(settings: {
  theme?: ThemeId;
  legend?: LegendPosition;
  customColors?: ThemeColorsMap;
  canvas?: CanvasTheme;
}): Record<string, string | undefined> {
  const properties: Record<string, string | undefined> = {};
  if (settings.theme !== undefined) {
    properties['theme'] = settings.theme === 'none' ? undefined : settings.theme;
  }
  if (settings.customColors) {
    properties['custom-theme'] = serializeCustomTheme(settings.customColors);
  }
  if (settings.canvas !== undefined) {
    properties['canvas'] = settings.canvas === 'dark' ? 'dark' : undefined;
  }
  if (settings.legend) {
    properties['legend-x'] = String(Math.round(settings.legend.x));
    properties['legend-y'] = String(Math.round(settings.legend.y));
  }
  return properties;
}
