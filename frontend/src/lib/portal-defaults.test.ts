import { beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_PORTAL_SETTINGS,
  PORTAL_DEFAULTS_STORAGE_KEY,
  loadPortalDefaults,
  savePortalDefaults,
  withPortalDefaults,
} from './portal-defaults';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D">
  <bpmn:process id="P" />
</bpmn:definitions>`;

describe('портальные дефолты (1.5.4)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('без сохранённых значений отдаёт дефолты редактора', () => {
    expect(loadPortalDefaults()).toEqual(DEFAULT_PORTAL_SETTINGS);
  });

  it('сохраняет и читает тему, холст и настройки ресайза', () => {
    savePortalDefaults({
      theme: 'classic',
      canvas: 'dark',
      resizeTasks: false,
      resizeOthers: true,
    });

    expect(loadPortalDefaults()).toEqual({
      theme: 'classic',
      canvas: 'dark',
      resizeTasks: false,
      resizeOthers: true,
    });
  });

  it('битый JSON не ломает новые схемы', () => {
    window.localStorage.setItem(PORTAL_DEFAULTS_STORAGE_KEY, '{oops');

    expect(loadPortalDefaults()).toEqual(DEFAULT_PORTAL_SETTINGS);
  });

  it('записывает настройки в XML новой схемы вместе с namespace', () => {
    const xml = withPortalDefaults(XML, {
      theme: 'warm',
      canvas: 'dark',
      resizeTasks: false,
      resizeOthers: true,
    });

    expect(xml).toContain('xmlns:bs="https://bpmn-studio.dev/schema/1.0"');
    expect(xml).toContain('bs:theme="warm"');
    expect(xml).toContain('bs:canvas="dark"');
    expect(xml).toContain('bs:resize-tasks="false"');
    expect(xml).toContain('bs:resize-others="true"');
    expect(xml.startsWith('<?xml')).toBe(true);
  });

  it('не дублирует namespace и не перетирает атрибуты существующей схемы', () => {
    const xml = withPortalDefaults(
      `<bpmn:definitions xmlns:bs="https://bpmn-studio.dev/schema/1.0" bs:resize-tasks="true" id="D" />`,
      { ...DEFAULT_PORTAL_SETTINGS, resizeTasks: false },
    );

    expect(xml.match(/xmlns:bs=/g)).toHaveLength(1);
    expect(xml).toContain('bs:resize-tasks="true"');
  });

  it('дефолтные значения не добавляют лишних атрибутов', () => {
    expect(withPortalDefaults(XML, DEFAULT_PORTAL_SETTINGS)).toBe(XML);
  });
});
