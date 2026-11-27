import { useState } from 'react';

import { ShortcutEditor } from '../components/ShortcutEditor';
import {
  AUTOSAVE_DEFAULT_SECONDS,
  AUTOSAVE_MAX_SECONDS,
  AUTOSAVE_MIN_SECONDS,
  clampAutosaveSeconds,
  loadAutosaveSeconds,
  saveAutosaveSeconds,
} from '../lib/autosave';
import {
  loadCanvasMouseMode,
  saveCanvasMouseMode,
  type CanvasMouseMode,
} from '../lib/mouse-settings';
import { loadMarkdownToolbarEnabled, saveMarkdownToolbarEnabled } from '../lib/markdown-settings';
import {
  DEFAULT_PROPERTIES_LAYOUT,
  PROPERTIES_FIELDS,
  PROPERTIES_SECTIONS,
  loadPropertiesLayout,
  moveItem,
  normalizePropertiesLayout,
  savePropertiesLayout,
  type PropertiesFieldId,
  type PropertiesLayout,
  type PropertiesSectionId,
} from '../lib/properties-layout';
import {
  loadResizeDefaults,
  saveResizeDefaults,
  type ResizeDefaults,
} from '../lib/resize-defaults';
import { loadShortcuts, saveShortcuts, type ShortcutMap } from '../lib/shortcuts';
import { loadTypePaletteEnabled, saveTypePaletteEnabled } from '../lib/type-palette';
import {
  loadValidationMode,
  saveValidationMode,
  type ValidationMode,
} from '../lib/validation-settings';

/**
 * Глобальные настройки платформы. Действуют на все схемы, в которых значение
 * не переопределено вручную в «Настройках схемы» редактора.
 */
export function SettingsPage() {
  const [autosaveDraft, setAutosaveDraft] = useState(() => String(loadAutosaveSeconds()));
  const [validationMode, setValidationMode] = useState<ValidationMode>(() => loadValidationMode());
  const [markdownToolbar, setMarkdownToolbar] = useState(() => loadMarkdownToolbarEnabled());
  const [typePalette, setTypePalette] = useState(() => loadTypePaletteEnabled());
  const [mouseMode, setMouseMode] = useState<CanvasMouseMode>(() => loadCanvasMouseMode());
  const [resizeDefaults, setResizeDefaults] = useState<ResizeDefaults>(() => loadResizeDefaults());
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => loadShortcuts());
  const [propertiesLayout, setPropertiesLayout] = useState<PropertiesLayout>(() =>
    loadPropertiesLayout(),
  );
  const [saved, setSaved] = useState(false);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  const commitAutosave = () => {
    const next = saveAutosaveSeconds(clampAutosaveSeconds(Number(autosaveDraft)));
    setAutosaveDraft(String(next));
    flashSaved();
  };

  const changeResize = (patch: Partial<ResizeDefaults>) => {
    const next = saveResizeDefaults({ ...resizeDefaults, ...patch });
    setResizeDefaults(next);
    flashSaved();
  };

  const changePropertiesLayout = (next: PropertiesLayout) => {
    setPropertiesLayout(savePropertiesLayout(next));
    flashSaved();
  };

  const moveSection = (id: PropertiesSectionId, delta: number) => {
    const from = propertiesLayout.sections.indexOf(id);
    changePropertiesLayout({
      ...propertiesLayout,
      sections: moveItem(propertiesLayout.sections, from, delta),
    });
  };

  const moveField = (id: PropertiesFieldId, delta: number) => {
    const from = propertiesLayout.fields.indexOf(id);
    changePropertiesLayout({
      ...propertiesLayout,
      fields: moveItem(propertiesLayout.fields, from, delta),
    });
  };

  return (
    <section className="page page--list settings-page">
      <header className="page-head">
        <div className="page-head__text">
          <span className="page-head__eyebrow">Платформа</span>
          <h1 className="page-head__title">Настройки</h1>
          <p className="page-head__subtitle">
            Действуют на все схемы, где значение не переопределено в редакторе.
          </p>
        </div>
        <div className="page-head__actions">
          <span className="settings-saved" role="status" aria-live="polite">
            {saved ? 'Сохранено' : ''}
          </span>
        </div>
      </header>

      <div className="settings-card">
        <h2 className="settings-card__title">Платформа</h2>

        <div className="settings-section">
          <h3 className="settings-section__title">Автосохранение</h3>
          <label className="settings-field">
            <span>Период сохранения на сервер, секунд</span>
            <input
              type="number"
              min={AUTOSAVE_MIN_SECONDS}
              max={AUTOSAVE_MAX_SECONDS}
              value={autosaveDraft}
              onChange={(event) => setAutosaveDraft(event.target.value)}
              onBlur={commitAutosave}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitAutosave();
                }
              }}
            />
          </label>
          <p className="dialog__hint">
            По умолчанию {AUTOSAVE_DEFAULT_SECONDS} с (3 минуты), допустимо от{' '}
            {AUTOSAVE_MIN_SECONDS} до {AUTOSAVE_MAX_SECONDS} с. Локальный черновик пишется чаще — он
            страхует от потери правок.
          </p>
        </div>

        <div className="settings-section">
          <h3 className="settings-section__title">Проверка схемы</h3>
          <label className="settings-field">
            <span>Когда проверять</span>
            <select
              value={validationMode}
              onChange={(event) => {
                setValidationMode(saveValidationMode(event.target.value as ValidationMode));
                flashSaved();
              }}
            >
              <option value="manual">Только по требованию</option>
              <option value="after-save">После сохранения</option>
            </select>
          </label>
          <p className="dialog__hint">
            «Только по требованию» — значение по умолчанию: проверка запускается кнопкой «Проверить»
            или горячей клавишей. «После сохранения» обновляет отчёт автоматически.
          </p>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-card__title">Редактор</h2>

        <div className="settings-section">
          <h3 className="settings-section__title">Поведение</h3>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={markdownToolbar}
              onChange={(event) => {
                setMarkdownToolbar(saveMarkdownToolbarEnabled(event.target.checked));
                flashSaved();
              }}
            />
            <span>Markdown-панель в документации элемента</span>
          </label>
          <p className="dialog__hint">
            Панель форматирования и предпросмотр в инспекторе. По умолчанию включена.
          </p>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={typePalette}
              onChange={(event) => {
                setTypePalette(saveTypePaletteEnabled(event.target.checked));
                flashSaved();
              }}
            />
            <span>Палитра смены типа сразу в ПКМ-меню</span>
          </label>
          <p className="dialog__hint">
            Показывает палитру значков слева от ПКМ-меню сразу после правого клика по элементу. По
            умолчанию включена.
          </p>
          <label className="settings-field">
            <span>Левая кнопка на пустом холсте</span>
            <select
              value={mouseMode}
              onChange={(event) => {
                setMouseMode(saveCanvasMouseMode(event.target.value as CanvasMouseMode));
                flashSaved();
              }}
            >
              <option value="select">Выделение рамкой</option>
              <option value="pan">Перемещение холста</option>
            </select>
          </label>
          <p className="dialog__hint">
            По умолчанию — выделение рамкой. Средняя кнопка мыши всегда двигает холст.
          </p>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-card__title">Вид схемы</h2>
        <p className="dialog__hint">
          Значения по умолчанию для новых и неизменённых схем. В редакторе их можно переопределить
          для конкретной диаграммы.
        </p>
        <div className="settings-section">
          <h3 className="settings-section__title">Размеры элементов</h3>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={resizeDefaults.tasks}
              onChange={(event) => changeResize({ tasks: event.target.checked })}
            />
            <span>Задачи и подпроцессы тянутся за ручки</span>
          </label>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={resizeDefaults.others}
              onChange={(event) => changeResize({ others: event.target.checked })}
            />
            <span>Остальные элементы тянутся за ручки</span>
          </label>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={resizeDefaults.compactBoundaryEvents}
              onChange={(event) => changeResize({ compactBoundaryEvents: event.target.checked })}
            />
            <span>Компактные граничные события</span>
          </label>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-card__title">Панель свойств</h2>
        <p className="dialog__hint">
          Порядок блоков и полей общий для всех схем и хранится в браузере. В редакторе его включает
          кнопка «⠿ Раскладка», а свернуть блок можно кнопкой в его заголовке.
        </p>
        <div className="layout-settings-grid">
          <div className="settings-section">
            <h3 className="settings-section__title">Порядок блоков</h3>
            <ul className="layout-order" aria-label="Порядок блоков свойств">
              {propertiesLayout.sections.map((id, index) => {
                const label = PROPERTIES_SECTIONS.find((item) => item.id === id)?.label ?? id;
                return (
                  <li key={id} className="layout-order__row">
                    <span className="layout-order__label">{label}</span>
                    <button
                      type="button"
                      className="ghost-button ghost-button--small"
                      aria-label={`Выше: ${label}`}
                      disabled={index === 0}
                      onClick={() => moveSection(id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost-button ghost-button--small"
                      aria-label={`Ниже: ${label}`}
                      disabled={index === propertiesLayout.sections.length - 1}
                      onClick={() => moveSection(id, 1)}
                    >
                      ↓
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="settings-section">
            <h3 className="settings-section__title">Порядок полей «Элемента»</h3>
            <ul className="layout-order" aria-label="Порядок полей элемента">
              {propertiesLayout.fields.map((id, index) => {
                const label = PROPERTIES_FIELDS.find((item) => item.id === id)?.label ?? id;
                return (
                  <li key={id} className="layout-order__row">
                    <span className="layout-order__label">{label}</span>
                    <button
                      type="button"
                      className="ghost-button ghost-button--small"
                      aria-label={`Выше: ${label}`}
                      disabled={index === 0}
                      onClick={() => moveField(id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="ghost-button ghost-button--small"
                      aria-label={`Ниже: ${label}`}
                      disabled={index === propertiesLayout.fields.length - 1}
                      onClick={() => moveField(id, 1)}
                    >
                      ↓
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() =>
              changePropertiesLayout(normalizePropertiesLayout(DEFAULT_PROPERTIES_LAYOUT))
            }
          >
            Сбросить раскладку
          </button>
        </div>
      </div>

      <div className="settings-card">
        <h2 className="settings-card__title">Горячие клавиши</h2>
        <ShortcutEditor
          shortcuts={shortcuts}
          onChange={(next) => {
            setShortcuts(next);
            saveShortcuts(next);
            flashSaved();
          }}
        />
      </div>
    </section>
  );
}
