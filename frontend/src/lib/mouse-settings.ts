/** Поведение левой кнопки мыши на пустом холсте (настройка в браузере). */

export type CanvasMouseMode = 'select' | 'pan';

const STORAGE_KEY = 'bpmn-studio.mouse-mode';

export function loadCanvasMouseMode(): CanvasMouseMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'pan' ? 'pan' : 'select';
  } catch {
    return 'select';
  }
}

export function saveCanvasMouseMode(mode: CanvasMouseMode): CanvasMouseMode {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Приватный режим: настройка просто не сохранится.
  }
  return mode;
}
