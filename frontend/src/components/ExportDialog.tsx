import { useEffect, useState } from 'react';

import { fetchExportJobs, type ExportJobSummary } from '../lib/api';

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

const STATUS_LABELS: Record<ExportJobSummary['status'], string> = {
  queued: 'в очереди',
  running: 'формируется',
  done: 'готово',
  failed: 'ошибка',
};

export function ExportDialog({
  open,
  diagramId,
  busy,
  progress,
  error,
  job,
  onClose,
  onExport,
  onDownloadJob,
}: {
  open: boolean;
  diagramId: string;
  busy: boolean;
  progress: number;
  error: string | null;
  job: ExportJobSummary | null;
  onClose: () => void;
  onExport: (
    kind: ExportKind,
    options: { page: 'A4' | 'A3'; orientation: 'portrait' | 'landscape' },
  ) => void;
  onDownloadJob: (job: ExportJobSummary) => void;
}) {
  const [page, setPage] = useState<'A4' | 'A3'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [history, setHistory] = useState<ExportJobSummary[]>([]);

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

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void fetchExportJobs(diagramId)
      .then((items) => {
        if (!cancelled) {
          setHistory(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistory([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, diagramId, job?.id, job?.status]);

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
          XLSX, DOCX и PDF формирует серверная очередь: задание можно закрыть и вернуться к нему из
          истории.
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

        {busy ? (
          <div className="export-progress" role="status" aria-live="polite">
            <div className="export-progress__row">
              <span>{job ? STATUS_LABELS[job.status] : 'Готовлю файл…'}</span>
              <span>{progress}%</span>
            </div>
            <progress max={100} value={progress} />
          </div>
        ) : null}
        {error ? <p className="dialog__error">{error}</p> : null}

        {history.length > 0 ? (
          <section className="export-history" aria-label="История экспорта">
            <h3 className="export-history__title">История выгрузок</h3>
            <ul>
              {history.slice(0, 8).map((item) => (
                <li key={item.id} className="export-history__item">
                  <span className="export-history__format">{item.format.toUpperCase()}</span>
                  <span
                    className={`export-history__status export-history__status--${item.status}`}
                    title={item.error ?? undefined}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                  <span className="export-history__date">
                    {new Date(item.created_at).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="export-history__size">
                    {item.size > 0 ? `${Math.max(1, Math.round(item.size / 1024))} КБ` : '—'}
                  </span>
                  <button
                    type="button"
                    className="ghost-button ghost-button--small"
                    disabled={item.status !== 'done'}
                    onClick={() => onDownloadJob(item)}
                  >
                    Скачать
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}
