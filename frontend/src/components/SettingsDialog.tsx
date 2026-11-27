import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  AUTOSAVE_DEFAULT_SECONDS,
  AUTOSAVE_MAX_SECONDS,
  AUTOSAVE_MIN_SECONDS,
  clampAutosaveSeconds,
} from '../lib/autosave';
import type { CanvasMouseMode } from '../lib/mouse-settings';
import type { ValidationMode } from '../lib/validation-settings';

/**
 * Настройки схемы. Показывают действующие значения и переопределяют
 * глобальные настройки только для открытой диаграммы.
 */
export function SettingsDialog({
  open,
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
  hasOverrides,
  onResetOverrides,
  onClose,
}: {
  open: boolean;
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
  hasOverrides: boolean;
  onResetOverrides: () => void;
  onClose: () => void;
}) {
  const [periodDraft, setPeriodDraft] = useState(String(autosaveSeconds));

  useEffect(() => {
    if (!open) {
      return;
    }
    setPeriodDraft(String(autosaveSeconds));
  }, [open, autosaveSeconds]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  const commitPeriod = () => {
    const next = clampAutosaveSeconds(Number(periodDraft));
    setPeriodDraft(String(next));
    onAutosaveChange(next);
  };

  if (!open) {
    return null;
  }

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
          <h2 className="dialog__title">Настройки схемы</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          Здесь меняются значения только для этой схемы. Остальные схемы используют{' '}
          <Link to="/settings" target="_blank" rel="noreferrer">
            глобальные настройки
          </Link>
          . Горячие клавиши теперь настраиваются там же.
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
            По умолчанию в глобальных настройках {AUTOSAVE_DEFAULT_SECONDS} с, допустимо от{' '}
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

        <footer className="dialog__footer">
          <button
            type="button"
            className="ghost-button"
            onClick={onResetOverrides}
            disabled={!hasOverrides}
            title="Вернуть значения из глобальных настроек"
          >
            Сбросить для схемы
          </button>
          <button type="button" className="ghost-button ghost-button--primary" onClick={onClose}>
            Готово
          </button>
        </footer>
      </section>
    </div>
  );
}
