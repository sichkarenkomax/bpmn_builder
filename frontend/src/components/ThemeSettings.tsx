import { useEffect } from 'react';

import { THEME_IDS, themeById, type ThemeId } from '../lib/diagram-theme';
import type { CanvasTheme } from '../lib/diagram-settings';

export function ThemeSettings({
  open,
  value,
  canvas,
  onChange,
  onCanvasChange,
  onClose,
}: {
  open: boolean;
  value: ThemeId;
  canvas: CanvasTheme;
  onChange: (id: ThemeId) => void;
  onCanvasChange: (canvas: CanvasTheme) => void;
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

  const cards = THEME_IDS.map((id) => themeById(id));

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
          Цветная тема оставляет цветные заливки и делает все границы чёрными. Чёрно-белая — белые
          заливки для печати. Ручной цвет из панели «Стиль» важнее темы. Тема и фон холста
          сохраняются вместе со схемой.
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
              <span className="theme-card__swatches" aria-hidden="true">
                {(['startEvent', 'intermediateEvent', 'endEvent', 'task', 'gateway'] as const).map(
                  (category) => (
                    <span
                      key={category}
                      className="theme-card__swatch"
                      style={{
                        background: theme.colors[category].fill,
                        borderColor: theme.colors[category].stroke,
                      }}
                    />
                  ),
                )}
              </span>
            </label>
          ))}
        </div>

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

        <footer className="dialog__footer">
          <button type="button" className="ghost-button ghost-button--primary" onClick={onClose}>
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
