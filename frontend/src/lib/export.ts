export type RasterScale = 1 | 2 | 4;

interface SvgModeler {
  saveSVG: () => Promise<{ svg?: string }>;
  get?: (name: string) => unknown;
}

interface CanvasContainer {
  getContainer?: () => Element;
}

interface SvgSize {
  width: number;
  height: number;
}

/** Достаёт размеры полного холста из viewBox, не доверяя только width/height. */
export function svgSize(svg: string): SvgSize {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = parsed.documentElement;
  const viewBox = root.getAttribute('viewBox')?.trim().split(/\s+/).map(Number) ?? [];
  if (viewBox.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: Math.max(1, viewBox[2] ?? 1), height: Math.max(1, viewBox[3] ?? 1) };
  }
  return {
    width: Math.max(1, Number.parseFloat(root.getAttribute('width') ?? '') || 1),
    height: Math.max(1, Number.parseFloat(root.getAttribute('height') ?? '') || 1),
  };
}

export async function modelerSvg(modeler: SvgModeler): Promise<string> {
  // saveSVG сериализует только inline-стили, а толщина связей и кегль подписей
  // заданы CSS. Без переноса computed styles SVG/PDF выглядят тоньше холста.
  const canvas = modeler.get?.('canvas') as CanvasContainer | undefined;
  const container = canvas?.getContainer?.();
  const saved: { element: Element; name: string; value: string | null }[] = [];
  const set = (element: Element, name: string, value: string) => {
    saved.push({ element, name, value: element.getAttribute(name) });
    element.setAttribute(name, value);
  };

  if (container) {
    for (const visual of container.querySelectorAll('.djs-connection .djs-visual')) {
      const style = window.getComputedStyle(visual);
      if (style.strokeWidth) {
        set(visual, 'stroke-width', style.strokeWidth);
      }
      if (style.fill) {
        set(visual, 'fill', style.fill);
      }
    }
    for (const label of container.querySelectorAll('.djs-label')) {
      const style = window.getComputedStyle(label);
      if (style.fontSize) {
        set(label, 'font-size', style.fontSize);
      }
      if (style.fontFamily) {
        set(label, 'font-family', style.fontFamily);
      }
    }
  }

  try {
    const result = await modeler.saveSVG();
    if (!result.svg) {
      throw new Error('bpmn-js вернул пустой SVG');
    }
    return result.svg;
  } finally {
    for (const { element, name, value } of saved) {
      if (value === null) {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, value);
      }
    }
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, filename: string, type: string): void {
  downloadBlob(new Blob([text], { type }), filename);
}

/** Рендерит полный SVG в PNG. Прозрачный фон сохраняется. */
export async function svgToPng(svg: string, scale: RasterScale): Promise<Blob> {
  const size = svgSize(svg);
  const maxSide = 8000;
  const factor = Math.min(scale, maxSide / Math.max(size.width, size.height));
  const width = Math.max(1, Math.round(size.width * factor));
  const height = Math.max(1, Math.round(size.height * factor));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('браузер не дал canvas для PNG');
    }
    context.drawImage(image, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function safeFileStem(value: string): string {
  const cleaned = [...value.trim()]
    .map((char) => (char.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(char) ? '-' : char))
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.slice(0, 80) || 'diagram';
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('не удалось отрисовать SVG'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('браузер не смог собрать PNG'));
      }
    }, 'image/png');
  });
}
