import { useEffect } from 'react';

/** Настройки изменения размеров элементов схемы (1.5.2–1.5.4). */
export function DiagramResizeSettings({
  open,
  resizeTasks,
  resizeOthers,
  compactBoundaryEvents,
  onResizeChange,
  onSavePortalDefaults,
  onClose,
}: {
  open: boolean;
  resizeTasks: boolean;
  resizeOthers: boolean;
  compactBoundaryEvents: boolean;
  onResizeChange: (patch: {
    tasks?: boolean;
    others?: boolean;
    compactBoundaryEvents?: boolean;
  }) => void;
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

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Настройки размеров"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Настройки размеров</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          Разрешения действуют на эту схему и сохраняются вместе с ней. Без разрешения у элементов
          не показываются ручки изменения размера.
        </p>

        <fieldset className="theme-editor">
          <legend className="theme-editor__title">Изменение размеров</legend>
          <label className="theme-editor__toggle">
            <input
              type="checkbox"
              checked={resizeTasks}
              onChange={(event) => onResizeChange({ tasks: event.target.checked })}
            />
            <span>Разрешить менять размеры задач, подпроцессов и комментариев</span>
          </label>
          <label className="theme-editor__toggle">
            <input
              type="checkbox"
              checked={resizeOthers}
              onChange={(event) => onResizeChange({ others: event.target.checked })}
            />
            <span>Разрешить менять размеры событий, шлюзов и данных</span>
          </label>
          <label className="theme-editor__toggle">
            <input
              type="checkbox"
              checked={compactBoundaryEvents}
              onChange={(event) => onResizeChange({ compactBoundaryEvents: event.target.checked })}
            />
            <span>Создавать граничные события вдвое меньше (18×18)</span>
          </label>
          <p className="theme-editor__hint">
            Компактный размер применяется к новым граничным событиям и к сбросу их размера. Уже
            нарисованные события не меняются.
          </p>
        </fieldset>

        <fieldset className="theme-editor">
          <legend className="theme-editor__title">Новые схемы</legend>
          <p className="theme-editor__hint">
            Значения по умолчанию для всего портала: текущая тема, фон холста и оба переключателя
            выше. Уже созданные схемы не меняются.
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
