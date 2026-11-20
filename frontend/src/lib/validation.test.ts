import { describe, expect, it } from 'vitest';

import type { ValidationFinding } from './api';
import {
  summarizeFindingsByElement,
  validationBadgeText,
  validationBadgeTitle,
} from './validation';

function finding(patch: Partial<ValidationFinding>): ValidationFinding {
  return {
    rule_id: 'BPMN-STRUCT-001',
    severity: 'warning',
    message: 'Замечание',
    element_id: 'Task_1',
    element_name: 'Задача',
    line: null,
    column: null,
    hint: null,
    ...patch,
  };
}

describe('summarizeFindingsByElement', () => {
  it('ignores document-level findings without an element', () => {
    const result = summarizeFindingsByElement([
      finding({ element_id: null, message: 'Ошибка XML' }),
    ]);
    expect(result.size).toBe(0);
  });

  it('groups findings and keeps the worst severity', () => {
    const result = summarizeFindingsByElement([
      finding({ message: 'Нет условия' }),
      finding({ severity: 'error', message: 'Нет старта' }),
      finding({ severity: 'info', message: 'Совет' }),
    ]);
    expect(result.get('Task_1')).toEqual({
      severity: 'error',
      count: 3,
      messages: ['Нет условия', 'Нет старта', 'Совет'],
    });
  });

  it('keeps separate elements and unique messages', () => {
    const result = summarizeFindingsByElement([
      finding({ element_id: 'A', message: 'Одинаково' }),
      finding({ element_id: 'A', message: 'Одинаково', rule_id: 'BPMN-STRUCT-002' }),
      finding({ element_id: 'B', message: 'Другое' }),
    ]);
    expect(result.get('A')?.count).toBe(2);
    expect(result.get('A')?.messages).toEqual(['Одинаково']);
    expect(result.get('B')?.count).toBe(1);
  });
});

describe('badge text', () => {
  it('uses a letter for information and an exclamation for problems', () => {
    expect(validationBadgeText('info')).toBe('i');
    expect(validationBadgeText('warning')).toBe('!');
    expect(validationBadgeText('error')).toBe('!');
  });

  it('describes the badge in Russian', () => {
    expect(
      validationBadgeTitle({
        severity: 'warning',
        count: 2,
        messages: ['Раз', 'Два'],
      }),
    ).toBe('2 предупреждение: Раз; Два');
  });
});
