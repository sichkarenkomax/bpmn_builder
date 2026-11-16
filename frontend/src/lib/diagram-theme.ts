/** Цветовые темы оформления схем (1.3.3) с приоритетом ручного стиля (1.3.16). */

export type ThemeId = 'none' | 'classic' | 'warm' | 'cool' | 'custom';

export type ThemeColors = {
  fill: string;
  stroke: string;
};

export type Category =
  | 'startEvent'
  | 'intermediateEvent'
  | 'endEvent'
  | 'task'
  | 'gateway'
  | 'subprocess'
  | 'data'
  | 'pool';

export type ThemeColorsMap = Record<Category, ThemeColors>;

export type DiagramTheme = {
  id: ThemeId;
  name: string;
  hint: string;
  colors: ThemeColorsMap;
};

/** Категории в порядке показа в редакторе своей темы. */
export const THEME_CATEGORIES: { id: Category; label: string }[] = [
  { id: 'startEvent', label: 'Стартовые события' },
  { id: 'intermediateEvent', label: 'Промежуточные события' },
  { id: 'endEvent', label: 'Завершающие события' },
  { id: 'task', label: 'Задачи' },
  { id: 'gateway', label: 'Шлюзы' },
  { id: 'subprocess', label: 'Подпроцессы' },
  { id: 'data', label: 'Данные' },
  { id: 'pool', label: 'Пулы и дорожки' },
];

export const THEME_IDS: ThemeId[] = ['none', 'classic', 'warm', 'cool', 'custom'];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as string[]).includes(value);
}

export const THEMES: DiagramTheme[] = [
  {
    id: 'none',
    name: 'Без темы',
    hint: 'только ручные цвета, выбранные в панели «Стиль»',
    colors: {
      startEvent: { fill: '#ffffff', stroke: '#4b5563' },
      intermediateEvent: { fill: '#ffffff', stroke: '#4b5563' },
      endEvent: { fill: '#ffffff', stroke: '#4b5563' },
      task: { fill: '#ffffff', stroke: '#4b5563' },
      gateway: { fill: '#ffffff', stroke: '#4b5563' },
      subprocess: { fill: '#ffffff', stroke: '#4b5563' },
      data: { fill: '#ffffff', stroke: '#4b5563' },
      pool: { fill: '#ffffff', stroke: '#94a3b8' },
    },
  },
  {
    id: 'classic',
    name: 'Классика',
    hint: 'зелёный старт, жёлтые промежуточные события и шлюзы, красный финиш, синие задачи',
    colors: {
      startEvent: { fill: '#ecfdf5', stroke: '#059669' },
      intermediateEvent: { fill: '#fefce8', stroke: '#ca8a04' },
      endEvent: { fill: '#fef2f2', stroke: '#dc2626' },
      task: { fill: '#eff6ff', stroke: '#2563eb' },
      gateway: { fill: '#fef9c3', stroke: '#d97706' },
      subprocess: { fill: '#dbeafe', stroke: '#1e40af' },
      data: { fill: '#f8fafc', stroke: '#64748b' },
      pool: { fill: '#ffffff', stroke: '#94a3b8' },
    },
  },
  {
    id: 'warm',
    name: 'Тёплая',
    hint: 'терракота и песок для презентаций заказчику',
    colors: {
      startEvent: { fill: '#fef3c7', stroke: '#b45309' },
      intermediateEvent: { fill: '#fef3c7', stroke: '#b45309' },
      endEvent: { fill: '#fef3c7', stroke: '#b45309' },
      task: { fill: '#fff1e6', stroke: '#c2410c' },
      gateway: { fill: '#fde68a', stroke: '#92400e' },
      subprocess: { fill: '#fae8ff', stroke: '#a21caf' },
      data: { fill: '#fafaf9', stroke: '#78716c' },
      pool: { fill: '#fffbf5', stroke: '#d6d3d1' },
    },
  },
  {
    id: 'cool',
    name: 'Холодная',
    hint: 'бирюза и индиго, хорошо читается в тёмной теме',
    colors: {
      startEvent: { fill: '#ecfeff', stroke: '#0e7490' },
      intermediateEvent: { fill: '#ecfeff', stroke: '#0e7490' },
      endEvent: { fill: '#ecfeff', stroke: '#0e7490' },
      task: { fill: '#eef2ff', stroke: '#4338ca' },
      gateway: { fill: '#f0fdfa', stroke: '#0f766e' },
      subprocess: { fill: '#f5f3ff', stroke: '#6d28d9' },
      data: { fill: '#f8fafc', stroke: '#475569' },
      pool: { fill: '#ffffff', stroke: '#94a3b8' },
    },
  },
];

const CLASSIC_COLORS = THEMES.find((theme) => theme.id === 'classic')!.colors;

/** Стартовый набор для «Своей темы»: цвета «Классики» как понятная база. */
export const DEFAULT_CUSTOM_COLORS: ThemeColorsMap = Object.fromEntries(
  Object.entries(CLASSIC_COLORS).map(([category, colors]) => [category, { ...colors }]),
) as ThemeColorsMap;

export const CUSTOM_THEME: DiagramTheme = {
  id: 'custom',
  name: 'Своя тема',
  hint: 'свой набор цветов по категориям, сохраняется вместе со схемой',
  colors: DEFAULT_CUSTOM_COLORS,
};

/** Готовая тема по id; для `custom` подставляются цвета из документа (1.3.11). */
export function themeById(id: ThemeId, customColors?: ThemeColorsMap | null): DiagramTheme {
  if (id === 'custom') {
    return customColors ? { ...CUSTOM_THEME, colors: customColors } : CUSTOM_THEME;
  }
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Разбор `bs:custom-theme`. Возвращает `null`, если атрибут пуст или испорчен:
 * тогда схема открывается с цветами «Классики», а не падает.
 */
export function parseCustomTheme(raw: string | undefined): ThemeColorsMap | null {
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const source = parsed as Record<string, unknown>;
  const colors = {} as ThemeColorsMap;
  for (const { id } of THEME_CATEGORIES) {
    const value = source[id];
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const { fill, stroke } = value as Record<string, unknown>;
    if (typeof fill !== 'string' || typeof stroke !== 'string') {
      return null;
    }
    if (!HEX_COLOR.test(fill) || !HEX_COLOR.test(stroke)) {
      return null;
    }
    colors[id] = { fill, stroke };
  }
  return colors;
}

export function serializeCustomTheme(colors: ThemeColorsMap): string {
  const plain: Record<string, ThemeColors> = {};
  for (const { id } of THEME_CATEGORIES) {
    plain[id] = { fill: colors[id].fill, stroke: colors[id].stroke };
  }
  return JSON.stringify(plain);
}

export function withCustomColor(
  colors: ThemeColorsMap,
  category: Category,
  key: keyof ThemeColors,
  value: string,
): ThemeColorsMap {
  return { ...colors, [category]: { ...colors[category], [key]: value } };
}

export function themeCategoryFor(type: string): Category {
  if (type.endsWith('StartEvent')) {
    return 'startEvent';
  }
  if (type.endsWith('EndEvent')) {
    return 'endEvent';
  }
  if (type.endsWith('Event')) {
    return 'intermediateEvent';
  }
  if (type.endsWith('Gateway')) {
    return 'gateway';
  }
  if (
    type === 'bpmn:SubProcess' ||
    type === 'bpmn:Transaction' ||
    type === 'bpmn:AdHocSubProcess'
  ) {
    return 'subprocess';
  }
  if (
    type === 'bpmn:DataObjectReference' ||
    type === 'bpmn:DataStoreReference' ||
    type === 'bpmn:DataInput' ||
    type === 'bpmn:DataOutput'
  ) {
    return 'data';
  }
  if (type === 'bpmn:Participant' || type === 'bpmn:Lane') {
    return 'pool';
  }
  return 'task';
}

/** Есть ли у элемента ручной цвет: тогда тема его не трогает (1.3.16). */
export function hasManualColor(
  di:
    | {
        get?: (name: string) => string | undefined;
      }
    | undefined,
): boolean {
  return Boolean(di?.get?.('color:background-color') || di?.get?.('color:border-color'));
}

export type LegendItem = { label: string; fill: string; stroke: string };

const LEGEND_LABELS: Record<Category, string> = {
  startEvent: 'Стартовые события',
  intermediateEvent: 'Промежуточные события',
  endEvent: 'Завершающие события',
  task: 'Задачи',
  gateway: 'Шлюзы',
  subprocess: 'Подпроцессы',
  data: 'Данные',
  pool: 'Пулы и дорожки',
};

/** Легенда строится по фактическим цветам схемы; ручной цвет важнее темы. */
export function buildLegendItems(
  elements: { type: string; di?: { get?: (name: string) => string | undefined } }[],
  theme: DiagramTheme,
): LegendItem[] {
  const seen = new Map<Category, LegendItem>();
  for (const element of elements) {
    if (element.type.endsWith('Label') || element.type === 'bpmn:Process') {
      continue;
    }
    const category = themeCategoryFor(element.type);
    if (seen.has(category)) {
      continue;
    }
    const fallback = theme.colors[category];
    seen.set(category, {
      label: LEGEND_LABELS[category],
      fill:
        element.di?.get?.('color:background-color') ??
        (theme.id === 'none' ? '#ffffff' : fallback.fill),
      stroke:
        element.di?.get?.('color:border-color') ??
        (theme.id === 'none' ? '#4b5563' : fallback.stroke),
    });
  }
  return (Object.keys(LEGEND_LABELS) as Category[])
    .filter((category) => seen.has(category))
    .map((category) => seen.get(category)!);
}

/**
 * Аннотация по нотации: скобка — это граница, а не прямоугольник.
 * Фон остаётся мягким серым, как в Bizagi, и никогда не получает обводку.
 */
export function applyAnnotationStyle(
  gfx: SVGGElement | undefined,
  colors?: { fill?: string; stroke?: string },
): void {
  if (!gfx) {
    return;
  }
  for (const child of gfx.querySelectorAll<SVGElement>('.djs-visual > *')) {
    if (child.tagName === 'rect') {
      child.style.fill = colors?.fill || '#f8fafc';
      child.style.stroke = 'none';
    } else if (child.tagName === 'path') {
      child.style.fill = 'none';
      child.style.stroke = colors?.stroke || '#4b5563';
    }
  }
}

/** Красит отрисованный элемент цветами темы, не записывая их в модель. */
export function applyThemeToGfx(
  gfx: SVGGElement | undefined,
  type: string,
  theme: DiagramTheme,
  options?: { strokeWidth?: string },
): void {
  if (!gfx) {
    return;
  }

  // Аннотация по нотации — только раскрытая скобка: bpmn-js кладёт перед ней
  // прозрачный прямоугольник, который тема не должна закрашивать.
  if (type === 'bpmn:TextAnnotation') {
    applyAnnotationStyle(gfx);
    return;
  }

  // Потоки и ассоциации — линии: заливка им не нужна, а обводка по нотации
  // остаётся чёрной независимо от цветовой темы.
  if (type.endsWith('Flow') || type.endsWith('Association')) {
    const isAssociation = type.endsWith('Association');
    for (const child of gfx.querySelectorAll<SVGElement>('.djs-visual > *')) {
      if (child instanceof SVGElement && child.tagName !== 'text') {
        child.style.stroke = '#000000';
        child.style.fill = 'none';
        if (isAssociation) {
          child.style.strokeDasharray = '3 3';
        }
      }
    }
    for (const marker of gfx.querySelectorAll<SVGElement>('.djs-visual defs marker path')) {
      marker.style.stroke = '#000000';
      marker.style.fill = '#000000';
    }
    return;
  }

  const colors = theme.colors[themeCategoryFor(type)];
  // У завершающего события по нотации толстая граница; ручная толщина
  // из панели «Стиль» важнее.
  const isEndEvent = type.endsWith('EndEvent');
  // Толстая граница по нотации — только у внешнего круга события.
  // Иконка внутри (terminate, error, message…) рисуется следом и должна
  // оставаться обычной толщины.
  let isBorder = isEndEvent;
  for (const child of gfx.querySelectorAll<SVGElement>('.djs-visual > *')) {
    if (!(child instanceof SVGElement)) {
      continue;
    }
    if (child.tagName === 'text' || child.classList.contains('djs-label')) {
      continue;
    }
    child.style.fill = colors.fill;
    child.style.stroke = colors.stroke;
    if (isBorder && !options?.strokeWidth) {
      child.style.strokeWidth = '4px';
    }
    isBorder = false;
  }
}
