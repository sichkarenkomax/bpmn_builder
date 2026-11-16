// Кастомные атрибуты элемента (1.3.6): хранение в camunda:properties,
// тип значения — в атрибуте bs:type на camunda:property (объявлен в bs-moddle.json).
// Строки тип не помечают — отсутствие bs:type означает «строка».

import { isSafeUrl } from './url';

export type AttributeType = 'string' | 'number' | 'date' | 'link';

export const ATTRIBUTE_TYPES: { value: AttributeType; label: string }[] = [
  { value: 'string', label: 'строка' },
  { value: 'number', label: 'число' },
  { value: 'date', label: 'дата' },
  { value: 'link', label: 'ссылка' },
];

export const BS_ATTR_TYPE = 'bs:type';

/** Тип атрибута из моддл-объекта: прямое свойство (команда) или $attrs (после reload). */
export function parseAttributeType(carrier: {
  type?: unknown;
  $attrs?: Record<string, string>;
}): AttributeType {
  const direct = typeof carrier.type === 'string' ? carrier.type : carrier.$attrs?.[BS_ATTR_TYPE];
  return isAttributeType(direct) ? direct : 'string';
}

/** Значение для XML: строка не помечается, остальные типы пишутся в bs:type. */
export function attributeTypeForXml(type: AttributeType): string | undefined {
  return type === 'string' ? undefined : type;
}

/** Строгая проверка значения типа (для чтения из XML). */
export function isAttributeType(value: unknown): value is AttributeType {
  return value === 'string' || value === 'number' || value === 'date' || value === 'link';
}

/** Подсказка-плейсхолдер под выбранный тип. */
export function attributeValuePlaceholder(type: AttributeType): string {
  switch (type) {
    case 'number':
      return '42';
    case 'date':
      return '2026-12-31';
    case 'link':
      return 'https://example.com';
    default:
      return 'значение';
  }
}

/** Возвращает текст ошибки формата или null, если значение подходит (пустое — тоже). */
export function validateAttributeValue(type: AttributeType, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  switch (type) {
    case 'number': {
      if (/^[+-]?(\d+([.,]\d+)?|\.\d+)$/.test(trimmed)) {
        return null;
      }
      return 'Число: например 42 или 12,5';
    }
    case 'date': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && isRealDate(trimmed)) {
        return null;
      }
      return 'Дата в формате ГГГГ-ММ-ДД';
    }
    case 'link': {
      if (isSafeUrl(trimmed)) {
        return null;
      }
      return 'Ссылка: https://…, mailto:… или относительный путь';
    }
    default:
      return null;
  }
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
