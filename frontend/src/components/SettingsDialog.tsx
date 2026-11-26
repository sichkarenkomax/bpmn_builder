import { useEffect, useRef, useState } from 'react';

import {
  AUTOSAVE_DEFAULT_SECONDS,
  AUTOSAVE_MAX_SECONDS,
  AUTOSAVE_MIN_SECONDS,
  clampAutosaveSeconds,
} from '../lib/autosave';
import type { CanvasMouseMode } from '../lib/mouse-settings';
import type { ValidationMode } from '../lib/validation-settings';
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

export function SettingsDialog({
  open,
  shortcuts,
  onChange,
  autosaveSeconds,
  onAutosaveChange,
  validationMode,
  onValidationModeChange,
  markdownToolbar,
  onMarkdownToolbarChange,
  mouseMode,
  onMouseModeChange,
  typePalette,
  onTypePaletteChange,
  onClose,
}: {
  open: boolean;
  shortcuts: ShortcutMap;
  onChange: (next: ShortcutMap) => void;
  autosaveSeconds: number;
  onAutosaveChange: (seconds: number) => void;
  validationMode: ValidationMode;
  onValidationModeChange: (mode: ValidationMode) => void;
  markdownToolbar: boolean;
  onMarkdownToolbarChange: (enabled: boolean) => void;
  mouseMode: CanvasMouseMode;
  onMouseModeChange: (mode: CanvasMouseMode) => void;
  typePalette: boolean;
  onTypePaletteChange: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [periodDraft, setPeriodDraft] = useState(String(autosaveSeconds));
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!open) {
      setCapturing(null);
      setError(null);
      return;
    }
    setPeriodDraft(String(autosaveSeconds));
  }, [open, autosaveSeconds]);

  const commitPeriod = () => {
    const next = clampAutosaveSeconds(Number(periodDraft));
    setPeriodDraft(String(next));
    onAutosaveChange(next);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!capturing) {
        if (event.key === 'Escape') {
          onClose();
        }
        return;
      }
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
  }, [open, capturing, onChange, onClose]);

  if (!open) {
    return null;
  }

  const resetAll = () => {
    onChange({ ...DEFAULT_SHORTCUTS });
    setCapturing(null);
    setError(null);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Настройки"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Настройки</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          Настройки действуют для всех схем и хранятся в этом браузере.
        </p>

        <div className="settings-section">
          <h3 className="settings-section__title">Автосохранение</h3>
          <label className="settings-field">
            <span>Период сохранения на сервер, секунд</span>
            <input
              type="number"
              min={AUTOSAVE_MIN_SECONDS}
              max={AUTOSAVE_MAX_SECONDS}
              value={periodDraft}
              onChange={(event) => setPeriodDraft(event.target.value)}
              onBlur={commitPeriod}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitPeriod();
                }
              }}
            />
          </label>
          <p className="dialog__hint">
            По умолчанию {AUTOSAVE_DEFAULT_SECONDS} с, допустимо от {AUTOSAVE_MIN_SECONDS} до{' '}
            {AUTOSAVE_MAX_SECONDS} с. Локальный черновик пишется чаще — он страхует от потери
            правок.
          </p>
        </div>

        <div className="settings-section">
          <h3 className="settings-section__title">Проверка схемы</h3>
          <label className="settings-field">
            <span>Когда проверять</span>
            <select
              value={validationMode}
              onChange={(event) => onValidationModeChange(event.target.value as ValidationMode)}
            >
              <option value="after-save">После сохранения</option>
              <option value="manual">Только по требованию</option>
            </select>
          </label>
          <p className="dialog__hint">
            «После сохранения» обновляет отчёт и маркеры автоматически. «Только по требованию»
            запускает проверку кнопкой «Проверить» или горячей клавишей.
          </p>
        </div>

        <div className="settings-section">
          <h3 className="settings-section__title">Редактор</h3>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={markdownToolbar}
              onChange={(event) => onMarkdownToolbarChange(event.target.checked)}
            />
            <span>Markdown-панель в документации элемента</span>
          </label>
          <p className="dialog__hint">
            Включает панель форматирования (заголовки, списки, ссылки) и предпросмотр в инспекторе.
            Выключите, чтобы вернуться к простому текстовому полю.
          </p>
          <label className="settings-field settings-field--checkbox">
            <input
              type="checkbox"
              checked={typePalette}
              onChange={(event) => onTypePaletteChange(event.target.checked)}
            />
            <span>Палитра смены типа сразу в ПКМ-меню</span>
          </label>
          <p className="dialog__hint">
            Показывает палитру значков слева от ПКМ-меню сразу после правого клика по элементу.
            Выключенная настройка прячет палитру, но оставляет пункт «Сменить тип» в меню.
          </p>
          <label className="settings-field">
            <span>Левая кнопка на пустом холсте</span>
            <select
              value={mouseMode}
              onChange={(event) => onMouseModeChange(event.target.value as CanvasMouseMode)}
            >
              <option value="select">Выделение рамкой</option>
              <option value="pan">Перемещение холста</option>
            </select>
          </label>
          <p className="dialog__hint">
            Средняя кнопка мыши всегда двигает холст. В режиме выделения рамка захватывает элементы,
            целиком попавшие внутрь; Shift добавляет их к текущему выделению.
          </p>
        </div>

        <p className="dialog__hint">Горячие клавиши: нажмите «Изменить» и введите комбинацию.</p>
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

        <footer className="dialog__footer">
          <button type="button" className="ghost-button" onClick={resetAll}>
            Сбросить все
          </button>
          <button type="button" className="ghost-button ghost-button--primary" onClick={onClose}>
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
