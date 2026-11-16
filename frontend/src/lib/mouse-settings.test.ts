import { beforeEach, describe, expect, it } from 'vitest';

import { loadCanvasMouseMode, saveCanvasMouseMode } from './mouse-settings';

describe('настройка мыши на холсте', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('по умолчанию ЛКМ выделяет рамкой', () => {
    expect(loadCanvasMouseMode()).toBe('select');
  });

  it('сохраняет режим панорамы', () => {
    saveCanvasMouseMode('pan');
    expect(loadCanvasMouseMode()).toBe('pan');
  });

  it('игнорирует неизвестное значение', () => {
    window.localStorage.setItem('bpmn-studio.mouse-mode', 'unknown');
    expect(loadCanvasMouseMode()).toBe('select');
  });
});
