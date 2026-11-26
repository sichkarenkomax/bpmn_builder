/**
 * Настройка «палитра смены типа» (1.5.8): включается в «Настройках» и
 * действует на все схемы в этом браузере. Включённая палитра появляется сразу
 * рядом с ПКМ-меню; выключенная — прячется, но остаётся пунктом «Сменить тип».
 */

export const TYPE_PALETTE_STORAGE_KEY = 'bpmn-studio.type-palette';
export const TYPE_PALETTE_DEFAULT = true;

export function loadTypePaletteEnabled(): boolean {
  try {
    const raw = window.localStorage.getItem(TYPE_PALETTE_STORAGE_KEY);
    return raw === null ? TYPE_PALETTE_DEFAULT : raw === 'true';
  } catch {
    return TYPE_PALETTE_DEFAULT;
  }
}

export function saveTypePaletteEnabled(enabled: boolean): boolean {
  try {
    window.localStorage.setItem(TYPE_PALETTE_STORAGE_KEY, String(enabled));
  } catch {
    // Приватный режим: настройка просто не сохранится.
  }
  return enabled;
}
