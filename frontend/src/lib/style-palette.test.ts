import { describe, expect, it } from 'vitest';

import {
  clearDefaultStyle,
  getDefaultStyle,
  isHexColor,
  loadStyleDefaults,
  parseStyleDefaults,
  saveStyleDefaults,
  styleLabel,
  withDefaultStyle,
} from './style-palette';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('isHexColor', () => {
  it('принимает только шестизначный hex', () => {
    expect(isHexColor('#a1b2c3')).toBe(true);
    expect(isHexColor('#A1B2C3')).toBe(true);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#fff')).toBe(false);
  });
});

describe('parseStyleDefaults', () => {
  it('читает валидные стили и нормализует цвет', () => {
    const parsed = parseStyleDefaults(
      JSON.stringify({ 'bpmn:UserTask': { fill: '#FFD966', stroke: '#1F8A4C' } }),
    );
    expect(parsed).toEqual({
      'bpmn:UserTask': { fill: '#ffd966', stroke: '#1f8a4c' },
    });
  });

  it('выбрасывает мусор и пустые стили', () => {
    expect(parseStyleDefaults('не json')).toEqual({});
    expect(parseStyleDefaults(JSON.stringify({ 'bpmn:Task': { fill: 'red' } }))).toEqual({});
    expect(parseStyleDefaults(JSON.stringify({ 'bpmn:Task': {} }))).toEqual({});
  });
});

describe('withDefaultStyle / clearDefaultStyle', () => {
  it('сохраняет стиль по типу и удаляет пустой', () => {
    const first = withDefaultStyle({}, 'bpmn:UserTask', { fill: '#dbeafe' });
    expect(getDefaultStyle(first, 'bpmn:UserTask')).toEqual({ fill: '#dbeafe' });

    const cleared = withDefaultStyle(first, 'bpmn:UserTask', {});
    expect(getDefaultStyle(cleared, 'bpmn:UserTask')).toBeUndefined();
  });

  it('удаляет стиль по типу', () => {
    const defaults = withDefaultStyle({}, 'bpmn:Task', { stroke: '#2f6feb' });
    expect(clearDefaultStyle(defaults, 'bpmn:Task')).toEqual({});
  });

  it('не мутирует исходный объект', () => {
    const defaults = { 'bpmn:Task': { fill: '#ffffff' } };
    withDefaultStyle(defaults, 'bpmn:Task', { fill: '#dcfce7' });
    expect(defaults['bpmn:Task']?.fill).toBe('#ffffff');
  });
});

describe('styleLabel', () => {
  it('описывает заполненные части стиля', () => {
    expect(styleLabel({ fill: '#ffffff', stroke: '#000000' })).toContain('заливка');
    expect(styleLabel({ stroke: '#000000' })).not.toContain('заливка');
    expect(styleLabel({})).toBe('');
  });
});

describe('loadStyleDefaults / saveStyleDefaults', () => {
  it('переживает сохранение и загрузку', () => {
    const storage = memoryStorage();
    saveStyleDefaults({ 'bpmn:Task': { fill: '#fef3c7' } }, storage);
    expect(loadStyleDefaults(storage)).toEqual({ 'bpmn:Task': { fill: '#fef3c7' } });
  });

  it('без хранилища работает как пустой набор', () => {
    expect(loadStyleDefaults(null)).toEqual({});
    saveStyleDefaults({ 'bpmn:Task': { fill: '#ffffff' } }, null);
  });
});
