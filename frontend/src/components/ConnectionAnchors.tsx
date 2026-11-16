import { useEffect, useState } from 'react';

import { ANCHOR_SIDES, type AnchorSide } from '../lib/connection-anchors';

/** Выбор точки примыкания начала и конца связи (четыре стороны). */
export function ConnectionAnchors({
  open,
  sourceName,
  targetName,
  source,
  target,
  onApply,
  onClose,
}: {
  open: boolean;
  sourceName: string;
  targetName: string;
  source: AnchorSide;
  target: AnchorSide;
  onApply: (source: AnchorSide, target: AnchorSide) => void;
  onClose: () => void;
}) {
  const [sourceSide, setSourceSide] = useState<AnchorSide>(source);
  const [targetSide, setTargetSide] = useState<AnchorSide>(target);

  useEffect(() => {
    if (open) {
      setSourceSide(source);
      setTargetSide(target);
    }
  }, [open, source, target]);

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
        aria-label="Точки примыкания связи"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Точки примыкания</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          Для шлюзов и событий связь примыкает к середине выбранной стороны. Сторону можно поменять
          в любой момент — линия перестроится.
        </p>

        <fieldset className="settings-section">
          <legend className="settings-section__title">Начало: {sourceName}</legend>
          <div className="anchor-options">
            {ANCHOR_SIDES.map((side) => (
              <label key={side.id} className="settings-field settings-field--checkbox">
                <input
                  type="radio"
                  name="anchor-source"
                  value={side.id}
                  checked={sourceSide === side.id}
                  onChange={() => setSourceSide(side.id)}
                />
                <span>{side.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="settings-section">
          <legend className="settings-section__title">Конец: {targetName}</legend>
          <div className="anchor-options">
            {ANCHOR_SIDES.map((side) => (
              <label key={side.id} className="settings-field settings-field--checkbox">
                <input
                  type="radio"
                  name="anchor-target"
                  value={side.id}
                  checked={targetSide === side.id}
                  onChange={() => setTargetSide(side.id)}
                />
                <span>{side.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <footer className="dialog__footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--primary"
            onClick={() => onApply(sourceSide, targetSide)}
          >
            Применить
          </button>
        </footer>
      </section>
    </div>
  );
}
