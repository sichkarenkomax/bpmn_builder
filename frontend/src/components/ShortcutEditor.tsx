import { useEffect, useRef, useState } from 'react';

import {
  comboFromEvent,
  DEFAULT_SHORTCUTS,
  describeAction,
  findConflict,
  formatCombo,
  normalizeCombo,
  SHORTCUT_DEFINITIONS,
  validateCombo,
  type ShortcutAction,
  type ShortcutMap,
} from '../lib/shortcuts';

/** Список горячих клавиш с записью комбинации — общий для глобальных настроек. */
export function ShortcutEditor({
  shortcuts,
  onChange,
}: {
  shortcuts: ShortcutMap;
  onChange: (next: ShortcutMap) => void;
}) {
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!capturing) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setCapturing(null);
        setError(null);
        return;
      }

      const combo = comboFromEvent(event);
      if (!combo) {
        return;
      }
      const normalized = normalizeCombo(combo);
      if (!normalized) {
        return;
      }
      const invalid = validateCombo(normalized);
      if (invalid) {
        setError(invalid);
        return;
      }
      const conflict = findConflict(shortcutsRef.current, normalized, capturing);
      if (conflict) {
        setError(`Комбинация занята: ${describeAction(conflict)}`);
        return;
      }
      onChange({ ...shortcutsRef.current, [capturing]: normalized });
      setCapturing(null);
      setError(null);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [capturing, onChange]);

  return (
    <>
      <p className="dialog__hint">
        Нажмите «Изменить» и введите комбинацию. Escape отменяет запись.
      </p>
      <div className="shortcut-list">
        {SHORTCUT_DEFINITIONS.map((definition) => {
          const isCapturing = capturing === definition.action;
          const isDefault = shortcuts[definition.action] === definition.combo;
          return (
            <div className="shortcut-row" key={definition.action}>
              <span className="shortcut-row__group">{definition.group}</span>
              <span className="shortcut-row__label">{definition.label}</span>
              <kbd
                className={
                  isCapturing
                    ? 'shortcut-row__keys shortcut-row__keys--capturing'
                    : 'shortcut-row__keys'
                }
              >
                {isCapturing ? 'нажмите клавиши…' : formatCombo(shortcuts[definition.action])}
              </kbd>
              <button
                type="button"
                className="ghost-button ghost-button--small"
                onClick={() => {
                  setCapturing(isCapturing ? null : definition.action);
                  setError(null);
                }}
              >
                {isCapturing ? 'Отмена' : 'Изменить'}
              </button>
              <button
                type="button"
                className="ghost-button ghost-button--small"
                disabled={isDefault}
                title="Вернуть по умолчанию"
                onClick={() => {
                  onChange({ ...shortcuts, [definition.action]: definition.combo });
                  setCapturing(null);
                  setError(null);
                }}
              >
                Сброс
              </button>
            </div>
          );
        })}
      </div>

      {error ? <p className="dialog__error">{error}</p> : null}

      <div className="shortcut-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            onChange({ ...DEFAULT_SHORTCUTS });
            setCapturing(null);
            setError(null);
          }}
        >
          Сбросить все комбинации
        </button>
      </div>
    </>
  );
}
