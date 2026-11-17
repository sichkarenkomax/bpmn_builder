/** Дополнительные стили элемента: то, что не выражается нативным biocolor. */

export const BS_ATTR = {
  fontFamily: 'bs:font-family',
  fontSize: 'bs:font-size',
  fontColor: 'bs:font-color',
  fontBold: 'bs:font-bold',
  fontItalic: 'bs:font-italic',
  textAlign: 'bs:text-align',
  textDirection: 'bs:text-direction',
  opacity: 'bs:opacity',
  strokeWidth: 'bs:stroke-width',
  strokeStyle: 'bs:stroke-style',
} as const;

/** Моддл-свойства, объявленные в bs-moddle.json (пишутся как bs:*-атрибуты DI). */
export type ExtendedStyleCarrier = {
  fontFamily?: string;
  fontSize?: string;
  fontColor?: string;
  fontBold?: boolean | string;
  fontItalic?: boolean | string;
  textAlign?: string;
  textDirection?: string;
  opacity?: string;
  strokeWidth?: string;
  strokeStyle?: string;
  $attrs?: Record<string, string>;
};

export type ExtendedStylePatch = Record<string, string | boolean | undefined>;

const FONT_FAMILIES = new Set([
  'Inter',
  'Arial',
  'Georgia',
  'Courier New',
  'Times New Roman',
  'system-ui',
]);

const STROKE_STYLES = new Set(['solid', 'dashed', 'dotted']);

function pick(carrier: ExtendedStyleCarrier, key: keyof typeof BS_ATTR): string {
  const attr = carrier.$attrs?.[BS_ATTR[key]];
  if (typeof attr === 'string' && attr !== '') {
    return attr;
  }
  const direct = carrier[key];
  if (typeof direct === 'boolean') {
    return direct ? 'true' : '';
  }
  return typeof direct === 'string' ? direct : '';
}

export function readExtendedStyle(carrier: ExtendedStyleCarrier | undefined): {
  fontFamily: string;
  fontSize: string;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  textAlign: string;
  textDirection: string;
  opacity: string;
  strokeWidth: string;
  strokeStyle: string;
} {
  const source = carrier ?? {};
  return {
    fontFamily: pick(source, 'fontFamily'),
    fontSize: pick(source, 'fontSize'),
    fontColor: pick(source, 'fontColor'),
    isBold: pick(source, 'fontBold') === 'true',
    isItalic: pick(source, 'fontItalic') === 'true',
    textAlign: pick(source, 'textAlign'),
    textDirection:
      pick(source, 'textDirection') === 'vertical' || pick(source, 'textDirection') === 'rotate'
        ? pick(source, 'textDirection')
        : '',
    opacity: pick(source, 'opacity'),
    strokeWidth: pick(source, 'strokeWidth'),
    strokeStyle: pick(source, 'strokeStyle'),
  };
}

/** Превращает патч инспектора в набор bs-атрибутов DI (undefined удаляет). */
export function toStyleAttributes(patch: {
  fontFamily?: string;
  fontSize?: string;
  fontColor?: string;
  isBold?: boolean;
  isItalic?: boolean;
  textAlign?: string;
  textDirection?: string;
  opacity?: string;
  strokeWidth?: string;
  strokeStyle?: string;
}): ExtendedStylePatch {
  const attrs: ExtendedStylePatch = {};
  if (patch.fontFamily !== undefined) {
    attrs[BS_ATTR.fontFamily] = sanitizeFontFamily(patch.fontFamily);
  }
  if (patch.fontSize !== undefined) {
    attrs[BS_ATTR.fontSize] = sanitizeFontSize(patch.fontSize);
  }
  if (patch.fontColor !== undefined) {
    attrs[BS_ATTR.fontColor] = sanitizeColor(patch.fontColor);
  }
  if (patch.isBold !== undefined) {
    attrs[BS_ATTR.fontBold] = patch.isBold ? 'true' : undefined;
  }
  if (patch.isItalic !== undefined) {
    attrs[BS_ATTR.fontItalic] = patch.isItalic ? 'true' : undefined;
  }
  if (patch.textAlign !== undefined) {
    attrs[BS_ATTR.textAlign] = sanitizeTextAlign(patch.textAlign);
  }
  if (patch.textDirection !== undefined) {
    attrs[BS_ATTR.textDirection] = sanitizeTextDirection(patch.textDirection);
  }
  if (patch.opacity !== undefined) {
    attrs[BS_ATTR.opacity] = sanitizeOpacity(patch.opacity);
  }
  if (patch.strokeWidth !== undefined) {
    attrs[BS_ATTR.strokeWidth] = sanitizeStrokeWidth(patch.strokeWidth);
  }
  if (patch.strokeStyle !== undefined) {
    attrs[BS_ATTR.strokeStyle] = STROKE_STYLES.has(patch.strokeStyle)
      ? patch.strokeStyle === 'solid'
        ? ''
        : patch.strokeStyle
      : '';
  }
  return attrs;
}

function sanitizeFontFamily(value: string): string {
  return FONT_FAMILIES.has(value) ? value : '';
}

function sanitizeFontSize(value: string): string {
  const size = Number.parseFloat(value);
  if (!Number.isFinite(size)) {
    return '';
  }
  return String(Math.min(48, Math.max(8, Math.round(size))));
}

function sanitizeTextAlign(value: string): string {
  return value === 'left' || value === 'center' || value === 'right' ? value : '';
}

function sanitizeTextDirection(value: string): string {
  return value === 'vertical' || value === 'rotate' ? value : '';
}

/**
 * Вертикальный текст или поворот подписи; горизонтальный — штатный вид без стилей.
 * Для вынесенных подписей поворот применяется ко всему фрейму (см.
 * applyExternalLabelLayout), а не к тексту отдельно.
 */
export function applyTextDirection(
  label: SVGTextElement,
  direction: string,
  rotateText = true,
): void {
  label.style.writingMode = direction === 'vertical' ? 'vertical-rl' : '';
  // mixed поворачивает кириллицу вслед за строкой, upright ставит буквы
  // столбиком и выводит их за пределы фигуры.
  label.style.textOrientation = direction === 'vertical' ? 'mixed' : '';
  label.style.transform = direction === 'rotate' && rotateText ? 'rotate(-90deg)' : '';
  label.style.transformBox = direction === 'rotate' && rotateText ? 'fill-box' : '';
  label.style.transformOrigin = direction === 'rotate' && rotateText ? 'center' : '';
}

function sanitizeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '';
}

function sanitizeOpacity(value: string): string {
  const opacity = Number.parseFloat(value);
  if (!Number.isFinite(opacity)) {
    return '';
  }
  const clamped = Math.min(1, Math.max(0.1, Math.round(opacity * 10) / 10));
  return clamped >= 1 ? '' : String(clamped);
}

function sanitizeStrokeWidth(value: string): string {
  const width = Number.parseFloat(value);
  if (!Number.isFinite(width)) {
    return '';
  }
  const clamped = Math.min(6, Math.max(1, Math.round(width)));
  return clamped === 1 ? '' : String(clamped);
}

/** Выравнивает подпись внутри фигуры, не меняя её вертикальное положение. */
function applyTextAlign(gfx: SVGGElement, align: string): void {
  if (align !== 'left' && align !== 'center' && align !== 'right') {
    return;
  }
  const labels = gfx.querySelectorAll<SVGTextElement>('.djs-label');
  if (labels.length === 0) {
    return;
  }
  // Подписи событий и шлюзов вынесены в отдельные фигуры без геометрии:
  // им оставляем штатное центрирование bpmn-js относительно самого элемента.
  const shape = gfx.querySelector<SVGGraphicsElement>(
    '.djs-visual > rect, .djs-visual > circle, .djs-visual > polygon, .djs-visual > ellipse',
  );
  if (!shape) {
    return;
  }
  const width = shape.getBBox().width;
  if (!Number.isFinite(width) || width <= 0) {
    return;
  }
  const padding = Math.min(7, width / 4);
  const x = align === 'left' ? padding : align === 'right' ? width - padding : width / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  for (const label of labels) {
    label.setAttribute('text-anchor', anchor);
    for (const line of label.querySelectorAll<SVGTextElement>('tspan')) {
      line.setAttribute('x', String(x));
    }
  }
}

/** Минимальный зазор между вынесенной подписью и контуром фигуры, в px холста. */
const EXTERNAL_LABEL_GAP = 4;
/** Отступ текста от края фигуры — как у встроенных подписей bpmn-js. */
const EXTERNAL_LABEL_PADDING = 7;

type ExternalLabelElement = {
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  di?: {
    label?: {
      bounds?: { x?: number; y?: number; width?: number; height?: number };
    };
    [key: string]: unknown;
  };
  labelTarget?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: unknown;
  };
};

/**
 * Раскладывает подпись, вынесенную bpmn-js под фигуру.
 *
 * Штатно она начинается ровно на нижней границе фигуры, поэтому текст
 * касается контура; добавляем небольшой зазор. Выравнивание берётся
 * с фигуры-владельца: у самой подписи таких атрибутов нет.
 */
export function applyExternalLabelLayout(
  gfx: SVGGElement | undefined,
  element: ExternalLabelElement,
  align: string,
  direction = '',
): void {
  if (!gfx || element.type !== 'label') {
    return;
  }
  const host = element.labelTarget;
  // Подписи связей остаются на линии потока, их не сдвигаем и не выравниваем.
  if (!host || host.waypoints) {
    return;
  }

  const rotatesFrame = direction === 'rotate';
  const label = gfx.querySelector<SVGTextElement>('.djs-label');
  if (!label) {
    return;
  }
  applyTextDirection(label, direction, !rotatesFrame);
  if (typeof element.y !== 'number' || typeof element.x !== 'number') {
    return;
  }

  const textBox = safeTextBox(label);
  if (textBox && typeof host.x === 'number' && typeof host.width === 'number') {
    fitExternalLabelFrame(gfx, element, host, textBox, align);
    label.style.transform = '';
  }

  let shift = 0;
  if (typeof host.y === 'number' && typeof host.height === 'number') {
    const bottom = host.y + host.height;
    shift = bottom + EXTERNAL_LABEL_GAP - element.y;
    if (shift < 0 || element.y < bottom - 2) {
      shift = 0;
    }
  }

  if (rotatesFrame) {
    const visual = gfx.querySelector<SVGGElement>('.djs-visual');
    if (visual) {
      visual.style.transformBox = 'fill-box';
      visual.style.transformOrigin = 'center';
      visual.style.transform = `translateY(${shift}px) rotate(-90deg)`;
    }
    const outline = gfx.querySelector<SVGGElement>('.djs-outline');
    if (outline) {
      outline.style.transformBox = 'fill-box';
      outline.style.transformOrigin = 'center';
      outline.style.transform = 'rotate(-90deg)';
    }
  } else {
    const visual = gfx.querySelector<SVGGElement>('.djs-visual');
    if (visual) {
      visual.style.transform = shift > 0 ? `translateY(${shift}px)` : '';
    }
  }

  if (align !== 'left' && align !== 'center' && align !== 'right') {
    return;
  }
  if (typeof host.x !== 'number' || typeof host.width !== 'number') {
    return;
  }
  const padding = Math.min(EXTERNAL_LABEL_PADDING, host.width / 4);
  const target =
    align === 'left'
      ? host.x + padding
      : align === 'right'
        ? host.x + host.width - padding
        : host.x + host.width / 2;
  const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  label.setAttribute('text-anchor', anchor);
  for (const line of label.querySelectorAll<SVGTextElement>('tspan')) {
    line.setAttribute('x', String(target - element.x));
  }
}

/**
 * Подгоняет невидимый фрейм вынесенной подписи под реальный текст.
 *
 * bpmn-js при импорте сохраняет записанную в DI ширину, а кегль подписей
 * в приложении меняется. Из-за этого текст больше фрейма: по центру он
 * выглядит неровно, а по краям вылезает наружу. Расширяем фрейм вокруг
 * выбранной стороны и центрируем строки по вертикали.
 */
function fitExternalLabelFrame(
  gfx: SVGGElement,
  element: ExternalLabelElement,
  host: NonNullable<ExternalLabelElement['labelTarget']>,
  textBox: { x: number; y: number; width: number; height: number },
  align: string,
): void {
  if (textBox.width <= 0 || textBox.height <= 0) {
    return;
  }
  const padding = Math.min(EXTERNAL_LABEL_PADDING, host.width! / 4);
  const width = Math.ceil(textBox.width + padding * 2);
  const height = Math.ceil(textBox.height + 4);
  const x =
    align === 'left'
      ? host.x!
      : align === 'right'
        ? host.x! + host.width! - width
        : host.x! + host.width! / 2 - width / 2;
  const centerY = element.y! + (element.height ?? height) / 2;
  const y = centerY - height / 2;

  if (element.x !== x || element.y !== y || element.width !== width || element.height !== height) {
    element.x = x;
    element.y = y;
    element.width = width;
    element.height = height;

    const bounds = element.di?.label?.bounds;
    if (bounds) {
      bounds.x = x;
      bounds.y = y;
      bounds.width = width;
      bounds.height = height;
    }
    gfx.setAttribute('transform', `matrix(1 0 0 1 ${x} ${y})`);
    const hit = gfx.querySelector<SVGRectElement>('.djs-hit');
    if (hit) {
      hit.setAttribute('x', '0');
      hit.setAttribute('y', '0');
      hit.setAttribute('width', String(width));
      hit.setAttribute('height', String(height));
    }
  }

  // Строки bpmn-js раскладывает от верхнего края; центрируем готовый текст
  // по вертикали, чтобы подпись не прилипала к верхней границе фрейма.
  const delta = height / 2 - (textBox.y + textBox.height / 2);
  if (Math.abs(delta) > 0.1) {
    for (const line of gfx.querySelectorAll<SVGTextElement>('.djs-label tspan')) {
      const current = Number.parseFloat(line.getAttribute('y') ?? '0');
      if (Number.isFinite(current)) {
        line.setAttribute('y', String(current + delta));
      }
    }
  }
}

function safeTextBox(
  element: SVGTextElement,
): { x: number; y: number; width: number; height: number } | null {
  try {
    const box = element.getBBox();
    return Number.isFinite(box.width) && Number.isFinite(box.height) ? box : null;
  } catch {
    return null;
  }
}

const DASH: Record<string, string | undefined> = {
  solid: undefined,
  dashed: '6 4',
  dotted: '1 3',
};

/** Применяет стили к отрисованному SVG-элементу (gfx из bpmn-js). */
export function applyStyleToGfx(
  gfx: SVGGElement | undefined,
  carrier: ExtendedStyleCarrier | undefined,
  type = '',
): void {
  if (!gfx) {
    return;
  }
  const style = readExtendedStyle(carrier);
  // У аннотации поворот применяется ко всему фрейму: иначе текст
  // переворачивается внутри неподвижного прямоугольника.
  const rotatesFrame = style.textDirection === 'rotate' && type === 'bpmn:TextAnnotation';
  const size = Number.parseFloat(style.fontSize);
  const width = Number.parseFloat(style.strokeWidth);

  gfx.style.opacity = style.opacity
    ? String(Math.min(1, Math.max(0.1, Number(style.opacity))))
    : '';

  for (const label of gfx.querySelectorAll<SVGTextElement>('.djs-label')) {
    label.style.fontFamily = style.fontFamily || '';
    label.style.fontSize = Number.isFinite(size) ? `${size}px` : '';
    label.style.fontWeight = style.isBold ? '700' : '';
    label.style.fontStyle = style.isItalic ? 'italic' : '';
    if (style.fontColor) {
      label.style.fill = style.fontColor;
    } else {
      label.style.removeProperty('fill');
    }
    applyTextDirection(label, style.textDirection, !rotatesFrame);
  }

  const visual = gfx.querySelector<SVGGElement>('.djs-visual');
  const outline = gfx.querySelector<SVGGElement>('.djs-outline');
  if (rotatesFrame) {
    for (const frame of [visual, outline]) {
      if (frame) {
        frame.style.transformBox = 'fill-box';
        frame.style.transformOrigin = 'center';
        frame.style.transform = 'rotate(-90deg)';
      }
    }
  } else {
    for (const frame of [visual, outline]) {
      if (frame) {
        frame.style.transform = '';
      }
    }
  }

  applyTextAlign(gfx, style.textAlign);

  const dash = DASH[style.strokeStyle];
  for (const child of gfx.querySelectorAll<SVGElement>('.djs-visual > *')) {
    if (child instanceof SVGElement) {
      child.style.strokeWidth = Number.isFinite(width) ? String(width) : '';
      child.style.strokeDasharray = dash ?? '';
    }
  }
}
