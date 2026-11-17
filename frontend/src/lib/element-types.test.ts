import { describe, expect, it } from 'vitest';

import { elementTypeLabel } from './element-types';

describe('elementTypeLabel', () => {
  it('переводит типы задач и событий', () => {
    expect(elementTypeLabel('bpmn:SendTask')).toBe('Отправка сообщения');
    expect(elementTypeLabel('bpmn:UserTask')).toBe('Пользовательская задача');
    expect(elementTypeLabel('bpmn:ManualTask')).toBe('Ручная задача');
    expect(elementTypeLabel('bpmn:ExclusiveGateway')).toBe('Эксклюзивный шлюз');
    expect(elementTypeLabel('bpmn:StartEvent')).toBe('Стартовое событие');
  });

  it('оставляет понятное имя для неизвестного типа', () => {
    expect(elementTypeLabel('bpmn:CustomThing')).toBe('Custom Thing');
    expect(elementTypeLabel('label')).toBe('Подпись');
  });
});
