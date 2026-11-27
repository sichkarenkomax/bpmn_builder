import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearAllPanelLayouts,
  clearPanelLayout,
  loadPanelLayout,
  savePanelLayout,
} from './panel-layout';

describe('положение и размер панелей холста', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('по умолчанию панель не смещена и без своего размера', () => {
    expect(loadPanelLayout('d1', 'simulation')).toEqual({ x: 0, y: 0 });
  });

  it('сохраняет смещение и размер между открытиями', () => {
    savePanelLayout('d1', 'simulation', { x: -120.4, y: 36.6, width: 420, height: 310 });
    expect(loadPanelLayout('d1', 'simulation')).toEqual({
      x: -120,
      y: 37,
      width: 420,
      height: 310,
    });
  });

  it('хранит раскладку отдельно для каждой диаграммы', () => {
    savePanelLayout('d1', 'simulation', { x: -40, y: 10 });
    savePanelLayout('d2', 'simulation', { x: 0, y: 70 });
    expect(loadPanelLayout('d1', 'simulation')).toEqual({ x: -40, y: 10 });
    expect(loadPanelLayout('d2', 'simulation')).toEqual({ x: 0, y: 70 });
  });

  it('сохраняет смещение без размера, если панель только перетащили', () => {
    savePanelLayout('d1', 'problems', { x: 15, y: -8 });
    expect(loadPanelLayout('d1', 'problems')).toEqual({ x: 15, y: -8 });
  });

  it('сбрасывает раскладку одной панели', () => {
    savePanelLayout('d1', 'comments', { x: 10, y: 10, width: 300, height: 200 });
    clearPanelLayout('d1', 'comments');
    expect(loadPanelLayout('d1', 'comments')).toEqual({ x: 0, y: 0 });
  });

  it('автоположение сбрасывает раскладки всех панелей диаграммы', () => {
    savePanelLayout('d1', 'comments', { x: 10, y: 10 });
    savePanelLayout('d1', 'simulation', { x: 20, y: 20 });
    savePanelLayout('d1', 'problems', { x: 30, y: 30 });
    savePanelLayout('d2', 'simulation', { x: 40, y: 40 });

    clearAllPanelLayouts('d1');

    expect(loadPanelLayout('d1', 'comments')).toEqual({ x: 0, y: 0 });
    expect(loadPanelLayout('d1', 'simulation')).toEqual({ x: 0, y: 0 });
    expect(loadPanelLayout('d1', 'problems')).toEqual({ x: 0, y: 0 });
    expect(loadPanelLayout('d2', 'simulation')).toEqual({ x: 40, y: 40 });
  });

  it('игнорирует битые значения', () => {
    window.localStorage.setItem(
      'bpmn-studio.panel-layout.d1.comments',
      JSON.stringify({ x: 'left', y: null, width: -5, height: 0 }),
    );
    expect(loadPanelLayout('d1', 'comments')).toEqual({ x: 0, y: 0 });
  });

  it('переживает битый JSON', () => {
    window.localStorage.setItem('bpmn-studio.panel-layout.d1.simulation', '{oops');
    expect(loadPanelLayout('d1', 'simulation')).toEqual({ x: 0, y: 0 });
  });
});
