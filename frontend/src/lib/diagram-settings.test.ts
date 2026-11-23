import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CUSTOM_COLORS,
  parseCustomTheme,
  serializeCustomTheme,
  themeById,
  type ThemeColorsMap,
} from './diagram-theme';
import { diagramSettingsProperties, readDiagramSettings } from './diagram-settings';

describe('настройки в документе', () => {
  it('читает тему и позицию легенды из прямых свойств moddle', () => {
    const settings = readDiagramSettings({ theme: 'colored', 'legend-x': '200', 'legend-y': '48' });

    expect(settings.theme).toBe('colored');
    expect(settings.legend).toEqual({ x: 200, y: 48 });
  });

  it('открывает старые темы как «Цветную», а «none» — как «Чёрно-белую»', () => {
    expect(readDiagramSettings({ theme: 'classic' }).theme).toBe('colored');
    expect(readDiagramSettings({ theme: 'warm' }).theme).toBe('colored');
    expect(readDiagramSettings({ theme: 'none' }).theme).toBe('mono');
  });

  it('читает те же значения из $attrs после импорта', () => {
    const settings = readDiagramSettings({
      $attrs: { 'bs:theme': 'warm', 'bs:legend-x': '10', 'bs:legend-y': '20' },
    });

    expect(settings.theme).toBe('colored');
    expect(settings.legend).toEqual({ x: 10, y: 20 });
  });

  it('игнорирует неизвестную тему и нечисловые координаты', () => {
    const settings = readDiagramSettings({ theme: 'neon', 'legend-x': 'слева', 'legend-y': '20' });

    expect(settings.theme).toBeNull();
    expect(settings.legend).toBeNull();
  });

  it('без атрибутов возвращает пустые настройки', () => {
    expect(readDiagramSettings(undefined)).toMatchObject({ theme: null, legend: null });
    expect(readDiagramSettings({})).toMatchObject({ theme: null, legend: null });
  });

  it('не пишет атрибут для темы по умолчанию и округляет позицию', () => {
    expect(diagramSettingsProperties({ theme: 'mono' })).toEqual({ theme: undefined });
    expect(diagramSettingsProperties({ theme: 'colored' })).toEqual({ theme: 'colored' });
    expect(diagramSettingsProperties({ legend: { x: 12.4, y: 8.6 } })).toEqual({
      'legend-x': '12',
      'legend-y': '9',
    });
  });

  it('нормализует свою тему до «Цветной»', () => {
    expect(diagramSettingsProperties({ theme: 'custom' })).toEqual({ theme: 'colored' });
    expect(readDiagramSettings({ theme: 'custom' }).theme).toBe('colored');
  });

  it('хранит и читает этапы в bs:stages', () => {
    const properties = diagramSettingsProperties({
      stages: [
        {
          id: 's1',
          name: 'Этап',
          poolId: 'Pool_1',
          x: 30,
          collapsed: true,
        },
      ],
    });
    const settings = readDiagramSettings({ $attrs: { 'bs:stages': properties['stages']! } });

    expect(settings.stages).toEqual([
      {
        id: 's1',
        name: 'Этап',
        poolId: 'Pool_1',
        x: 30,
        collapsed: true,
      },
    ]);
    expect(diagramSettingsProperties({ stages: [] })['stages']).toBeUndefined();
  });

  it('хранит фон холста только для тёмного варианта', () => {
    expect(diagramSettingsProperties({ canvas: 'dark' })).toEqual({ canvas: 'dark' });
    expect(diagramSettingsProperties({ canvas: 'light' })).toEqual({ canvas: undefined });
    expect(readDiagramSettings({ $attrs: { 'bs:canvas': 'dark' } }).canvas).toBe('dark');
    expect(readDiagramSettings({}).canvas).toBe('light');
  });

  it('по умолчанию ресайз задач включён, остальных элементов — выключен', () => {
    const settings = readDiagramSettings(undefined);

    expect(settings.resizeTasks).toBe(true);
    expect(settings.resizeOthers).toBe(false);
    expect(settings.compactBoundaryEvents).toBe(false);
  });

  it('хранит компактные граничные события только при включении', () => {
    expect(diagramSettingsProperties({ compactBoundaryEvents: false })).toEqual({
      'compact-boundary-events': undefined,
    });
    expect(diagramSettingsProperties({ compactBoundaryEvents: true })).toEqual({
      'compact-boundary-events': 'true',
    });
    expect(
      readDiagramSettings({ $attrs: { 'bs:compact-boundary-events': 'true' } })
        .compactBoundaryEvents,
    ).toBe(true);
  });

  it('читает и пишет настройки ресайза только при отличии от дефолта', () => {
    expect(
      readDiagramSettings({
        $attrs: { 'bs:resize-tasks': 'false', 'bs:resize-others': 'true' },
      }),
    ).toMatchObject({ resizeTasks: false, resizeOthers: true });

    expect(diagramSettingsProperties({ resizeTasks: true, resizeOthers: false })).toEqual({
      'resize-tasks': undefined,
      'resize-others': undefined,
    });
    expect(diagramSettingsProperties({ resizeTasks: false, resizeOthers: true })).toEqual({
      'resize-tasks': 'false',
      'resize-others': 'true',
    });
  });
});

describe('своя тема (1.3.11)', () => {
  it('переживает запись и чтение JSON-атрибута', () => {
    const colors: ThemeColorsMap = {
      ...DEFAULT_CUSTOM_COLORS,
      task: { fill: '#112233', stroke: '#445566' },
    };
    const properties = diagramSettingsProperties({ customColors: colors });
    const settings = readDiagramSettings({
      $attrs: { 'bs:custom-theme': properties['custom-theme']! },
    });

    expect(settings.customColors).toEqual(colors);
    expect(serializeCustomTheme(DEFAULT_CUSTOM_COLORS)).toContain('"task"');
  });

  it('битый или неполный атрибут не ломает открытие схемы', () => {
    expect(parseCustomTheme('{')).toBeNull();
    expect(parseCustomTheme('{"task":{"fill":"#ffffff","stroke":"#000000"}}')).toBeNull();
    expect(
      parseCustomTheme(serializeCustomTheme(DEFAULT_CUSTOM_COLORS).replace('#eff6ff', 'blue')),
    ).toBeNull();
    expect(readDiagramSettings({ 'bs:custom-theme': 'не json' }).customColors).toBeNull();
  });

  it('устаревшая тема custom подставляет свои цвета', () => {
    const colors: ThemeColorsMap = {
      ...DEFAULT_CUSTOM_COLORS,
      gateway: { fill: '#010203', stroke: '#040506' },
    };

    expect(themeById('custom', colors).colors.gateway).toEqual({
      fill: '#010203',
      stroke: '#040506',
    });
    expect(themeById('custom').colors).toBe(DEFAULT_CUSTOM_COLORS);
  });
});
