import { useEffect } from 'react';

import {
  CUSTOM_THEME,
  THEME_CATEGORIES,
  THEME_IDS,
  themeById,
  withCustomColor,
  type Category,
  type ThemeColorsMap,
  type ThemeId,
} from '../lib/diagram-theme';
import type { CanvasTheme } from '../lib/diagram-settings';

export function ThemeSettings({
  open,
  value,
  customColors,
  canvas,
  resizeTasks,
  resizeOthers,
  onChange,
  onCustomColorsChange,
  onCanvasChange,
  onResizeChange,
  onSavePortalDefaults,
  onClose,
}: {
  open: boolean;
  value: ThemeId;
  customColors: ThemeColorsMap;
  canvas: CanvasTheme;
  resizeTasks: boolean;
  resizeOthers: boolean;
  onChange: (id: ThemeId) => void;
  onCustomColorsChange: (colors: ThemeColorsMap) => void;
  onCanvasChange: (canvas: CanvasTheme) => void;
  onResizeChange: (patch: { tasks?: boolean; others?: boolean }) => void;
  onSavePortalDefaults: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const cards = THEME_IDS.map((id) => themeById(id, customColors));
  const updateColor = (category: Category, key: 'fill' | 'stroke', color: string) => {
    onCustomColorsChange(withCustomColor(customColors, category, key, color));
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Тема оформления"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Тема оформления</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          Тема задаёт цвета элементов, у которых ещё нет ручного цвета. Если цвет выбран в панели
          «Стиль», тема его не перекрывает. Тема, свои цвета и фон холста сохраняются вместе со
          схемой.
        </p>

        <div className="theme-list" role="radiogroup" aria-label="Темы схемы">
          {cards.map((theme) => (
            <label
              key={theme.id}
              className={theme.id === value ? 'theme-card theme-card--active' : 'theme-card'}
            >
              <input
                type="radio"
                name="diagram-theme"
                value={theme.id}
                checked={theme.id === value}
                onChange={() => onChange(theme.id)}
              />
              <span className="theme-card__body">
                <span className="theme-card__name">{theme.name}</span>
                <span className="theme-card__hint">{theme.hint}</span>
              </span>
              {theme.id === 'none' ? null : (
                <span className="theme-card__swatches" aria-hidden="true">
                  {(
                    ['startEvent', 'intermediateEvent', 'endEvent', 'task', 'gateway'] as const
                  ).map((category) => (
                    <span
                      key={category}
                      className="theme-card__swatch"
                      style={{
                        background: theme.colors[category].fill,
                        borderColor: theme.colors[category].stroke,
                      }}
                    />
                  ))}
                </span>
              )}
            </label>
          ))}
        </div>

        <fieldset className="theme-editor">
          <legend className="theme-editor__title">Своя тема</legend>
          <p className="theme-editor__hint">
            Выберите «Свою тему» выше и настройте цвета категорий. Кнопка ниже возвращает набор
            «Классики».
          </p>
          <div className="theme-editor__grid">
            {THEME_CATEGORIES.map(({ id, label }) => (
              <div key={id} className="theme-editor__row">
                <span className="theme-editor__label">{label}</span>
                <label className="theme-editor__field" title="Заливка">
                  <span className="theme-editor__field-name">З</span>
                  <input
                    type="color"
                    aria-label={`Заливка: ${label}`}
                    value={customColors[id].fill}
                    onChange={(event) => updateColor(id, 'fill', event.target.value)}
                  />
                </label>
                <label className="theme-editor__field" title="Обводка">
                  <span className="theme-editor__field-name">О</span>
                  <input
                    type="color"
                    aria-label={`Обводка: ${label}`}
                    value={customColors[id].stroke}
                    onChange={(event) => updateColor(id, 'stroke', event.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="theme-editor__actions">
            <button
              type="button"
              className="ghost-button ghost-button--small"
              onClick={() => onCustomColorsChange(CUSTOM_THEME.colors)}
            >
              Сбросить к «Классике»
            </button>
          </div>
        </fieldset>

        <fieldset className="theme-editor">
          <legend className="theme-editor__title">Холст</legend>
          <label className="theme-editor__toggle">
            <input
              type="checkbox"
              checked={canvas === 'dark'}
              onChange={(event) => onCanvasChange(event.target.checked ? 'dark' : 'light')}
            />
            <span>Тёмный фон холста (для презентаций и тёмных тем)</span>
          </label>
        </fieldset>

        <fieldset className="theme-editor">
          <legend className="theme-editor__title">Изменение размеров</legend>
          <label className="theme-editor__toggle">
            <input
              type="checkbox"
              checked={resizeTasks}
              onChange={(event) => onResizeChange({ tasks: event.target.checked })}
            />
            <span>Разрешить менять размеры задач и подпроцессов</span>
          </label>
          <label className="theme-editor__toggle">
            <input
              type="checkbox"
              checked={resizeOthers}
              onChange={(event) => onResizeChange({ others: event.target.checked })}
            />
            <span>Разрешить менять размеры событий, шлюзов, данных и аннотаций</span>
          </label>
          <p className="theme-editor__hint">
            Без разрешения у элементов не показываются ручки изменения размера. Включённые значения
            сохраняются вместе со схемой.
          </p>
          <div className="theme-editor__actions">
            <button
              type="button"
              className="ghost-button ghost-button--small"
              onClick={onSavePortalDefaults}
            >
              Сделать значениями по умолчанию для новых схем
            </button>
          </div>
        </fieldset>

        <footer className="dialog__footer">
          <button type="button" className="ghost-button ghost-button--primary" onClick={onClose}>
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
