import { useEffect, useState } from 'react';

export type ExportKind =
  'svg' | 'png1x' | 'png2x' | 'png4x' | 'bpmn' | 'json' | 'csv' | 'xlsx' | 'docx' | 'pdf';

const OPTIONS: { kind: ExportKind; label: string; hint: string }[] = [
  { kind: 'svg', label: 'SVG', hint: 'вектор для вставки в документы' },
  { kind: 'png1x', label: 'PNG 1×', hint: 'экранное качество, прозрачный фон' },
  { kind: 'png2x', label: 'PNG 2×', hint: 'для презентаций' },
  { kind: 'png4x', label: 'PNG 4×', hint: 'для печати' },
  { kind: 'bpmn', label: 'BPMN XML', hint: 'для Camunda Modeler и bpmn-js' },
  { kind: 'json', label: 'JSON', hint: 'модель для интеграций' },
  { kind: 'csv', label: 'CSV', hint: 'реестр элементов для Excel' },
  { kind: 'xlsx', label: 'XLSX', hint: 'реестр с фильтрами' },
  { kind: 'docx', label: 'DOCX', hint: 'паспорт процесса' },
  { kind: 'pdf', label: 'PDF', hint: 'печать A4/A3, многократно' },
];

export function ExportDialog({
  open,
  busy,
  error,
  onClose,
  onExport,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onExport: (
    kind: ExportKind,
    options: { page: 'A4' | 'A3'; orientation: 'portrait' | 'landscape' },
  ) => void;
}) {
  const [page, setPage] = useState<'A4' | 'A3'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');

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
        className="dialog dialog--export"
        role="dialog"
        aria-modal="true"
        aria-label="Экспорт диаграммы"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Экспорт диаграммы</h2>
          <button type="button" className="ghost-button" onClick={onClose} disabled={busy}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          SVG, PNG и BPMN собираются из текущего холста, включая несохранённые правки. JSON, CSV,
          XLSX, DOCX и PDF формирует сервер.
        </p>

        <div className="export-grid">
          {OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              className="export-card"
              disabled={busy}
              onClick={() => onExport(option.kind, { page, orientation })}
            >
              <strong>{option.label}</strong>
              <span>{option.hint}</span>
            </button>
          ))}
        </div>

        <div className="dialog-form dialog-form--inline">
          <label>
            <span>Формат PDF</span>
            <select value={page} onChange={(event) => setPage(event.target.value as 'A4' | 'A3')}>
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>
          </label>
          <label>
            <span>Ориентация</span>
            <select
              value={orientation}
              onChange={(event) => setOrientation(event.target.value as 'portrait' | 'landscape')}
            >
              <option value="landscape">Альбомная</option>
              <option value="portrait">Портретная</option>
            </select>
          </label>
        </div>

        {busy ? <p className="dialog__hint">Готовлю файл…</p> : null}
        {error ? <p className="dialog__error">{error}</p> : null}
      </section>
    </div>
  );
}
