import { describe, expect, it } from 'vitest';

import {
  attributeTypeForXml,
  attributeValuePlaceholder,
  isAttributeType,
  parseAttributeType,
  validateAttributeValue,
} from './attributes';

describe('validateAttributeValue', () => {
  it('число: целые и дробные с точкой и запятой, со знаком', () => {
    expect(validateAttributeValue('number', '42')).toBeNull();
    expect(validateAttributeValue('number', '-12,5')).toBeNull();
    expect(validateAttributeValue('number', '+0.75')).toBeNull();
    expect(validateAttributeValue('number', '.5')).toBeNull();
    expect(validateAttributeValue('number', '4h')).toBe('Число: например 42 или 12,5');
    expect(validateAttributeValue('number', '1 000')).toBe('Число: например 42 или 12,5');
  });

  it('дата: только настоящий календарный день в формате ГГГГ-ММ-ДД', () => {
    expect(validateAttributeValue('date', '2026-12-31')).toBeNull();
    expect(validateAttributeValue('date', '2026-02-29')).toBe('Дата в формате ГГГГ-ММ-ДД'); // 2026 — не високосный
    expect(validateAttributeValue('date', '2024-02-29')).toBeNull();
    expect(validateAttributeValue('date', '16.11.2026')).toBe('Дата в формате ГГГГ-ММ-ДД');
    expect(validateAttributeValue('date', '2026-13-01')).toBe('Дата в формате ГГГГ-ММ-ДД');
  });

  it('ссылка: http(s), mailto и относительные, прочие схемы отклоняются', () => {
    expect(validateAttributeValue('link', 'https://example.com/sla')).toBeNull();
    expect(validateAttributeValue('link', 'mailto:ops@example.com')).toBeNull();
    expect(validateAttributeValue('link', '/docs/sla')).toBeNull();
    expect(validateAttributeValue('link', "javascript:alert('x')")).toBe(
      'Ссылка: https://…, mailto:… или относительный путь',
    );
    expect(validateAttributeValue('link', 'просто текст')).toBe(
      'Ссылка: https://…, mailto:… или относительный путь',
    );
  });

  it('строка принимает всё, пустое значение всегда валидно', () => {
    expect(validateAttributeValue('string', 'что угодно **текст**')).toBeNull();
    expect(validateAttributeValue('number', '')).toBeNull();
    expect(validateAttributeValue('date', '  ')).toBeNull();
    expect(validateAttributeValue('link', '')).toBeNull();
  });
});

describe('parseAttributeType', () => {
  it('читает тип из прямого свойства и из $attrs', () => {
    expect(parseAttributeType({ type: 'number' })).toBe('number');
    expect(parseAttributeType({ $attrs: { 'bs:type': 'date' } })).toBe('date');
  });

  it('неизвестное и отсутствующее значение означают строку', () => {
    expect(parseAttributeType({})).toBe('string');
    expect(parseAttributeType({ type: 'float' })).toBe('string');
    expect(parseAttributeType({ type: 42 })).toBe('string');
  });
});

describe('attributeTypeForXml', () => {
  it('строку не помечает, остальные типы отдаёт как есть', () => {
    expect(attributeTypeForXml('string')).toBeUndefined();
    expect(attributeTypeForXml('number')).toBe('number');
    expect(attributeTypeForXml('date')).toBe('date');
    expect(attributeTypeForXml('link')).toBe('link');
  });
});

describe('isAttributeType и плейсхолдеры', () => {
  it('распознаёт допустимые типы', () => {
    expect(isAttributeType('link')).toBe(true);
    expect(isAttributeType('int')).toBe(false);
    expect(isAttributeType(undefined)).toBe(false);
  });

  it('плейсхолдеры подсказывают формат', () => {
    expect(attributeValuePlaceholder('string')).toBe('значение');
    expect(attributeValuePlaceholder('number')).toBe('42');
    expect(attributeValuePlaceholder('date')).toBe('2026-12-31');
    expect(attributeValuePlaceholder('link')).toBe('https://example.com');
  });
});
