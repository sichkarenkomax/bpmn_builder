/** Закрепление элементов: состояние хранится в DI-атрибуте `bs:locked`. */

export type LockCarrier = {
  locked?: boolean | string;
  $attrs?: Record<string, string>;
};

export function isElementLocked(carrier: LockCarrier | undefined): boolean {
  const value = carrier?.$attrs?.['bs:locked'] ?? carrier?.locked;
  return value === true || value === 'true';
}
