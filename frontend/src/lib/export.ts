export type RasterScale = 1 | 2 | 4;

interface SvgModeler {
  saveSVG: () => Promise<{ svg?: string }>;
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
  const result = await modeler.saveSVG();
  if (!result.svg) {
    throw new Error('bpmn-js вернул пустой SVG');
  }
  return result.svg;
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
