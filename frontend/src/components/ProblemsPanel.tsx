import { useEffect, useMemo, useRef, useState } from 'react';

import { usePanelDrag } from '../hooks/usePanelDrag';
import type { ValidationFinding, ValidationReport } from '../lib/api';

const SEVERITIES = ['error', 'warning', 'info'] as const;
type Severity = (typeof SEVERITIES)[number];

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Ошибки',
  warning: 'Предупреждения',
  info: 'Информация',
};

/** Панель результатов проверки схемы (2.3.2–2.3.3). */
export function ProblemsPanel({
  report,
  stale,
  busy,
  error,
  onSelect,
  onDownload,
  downloading,
  onClose,
  highlighted,
  scope,
  autoLayout,
}: {
  report: ValidationReport | null;
  stale: boolean;
  busy: boolean;
  error: string | null;
  onSelect: (finding: ValidationFinding) => void;
  onDownload: () => void;
  downloading: boolean;
  onClose: () => void;
  highlighted: ValidationFinding | null;
  scope: string;
  autoLayout: boolean;
}) {
  const [filters, setFilters] = useState<Record<Severity, boolean>>({
    error: true,
    warning: true,
    info: true,
  });
  const [collapsed, setCollapsed] = useState<Record<Severity, boolean>>({
    error: false,
    warning: false,
    info: false,
  });

  const groups = useMemo(() => {
    const result: Record<Severity, ValidationFinding[]> = {
      error: [],
      warning: [],
      info: [],
    };
    for (const finding of report?.findings ?? []) {
      if (filters[finding.severity]) {
        result[finding.severity].push(finding);
      }
    }
    return result;
  }, [filters, report]);

  const counts = report?.summary ?? { errors: 0, warnings: 0, infos: 0 };
  const visibleCount = groups.error.length + groups.warning.length + groups.info.length;
  const drag = usePanelDrag('problems', scope, autoLayout);
  const highlightedRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const isHighlighted = (finding: ValidationFinding) =>
    highlighted !== null &&
    highlighted.rule_id === finding.rule_id &&
    highlighted.element_id === finding.element_id &&
    highlighted.message === finding.message;

  return (
    <section
      ref={drag.panelRef}
      className="comments-panel problems-panel"
      style={drag.panelStyle}
      aria-label="Проблемы"
    >
      <header className="comments-panel__header" {...drag.handleProps}>
        <div>
          <h2 className="comments-panel__title">Проблемы</h2>
          <p
            className="comments-panel__element"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {report
              ? `${report.findings.length} находок · ${report.duration_ms} мс`
              : 'проверка схемы'}
          </p>
        </div>
        <div className="problems-panel__actions">
          <button
            type="button"
            className="ghost-button ghost-button--small"
            disabled={!report || downloading}
            title="Скачать отчёт проверки в DOCX"
            onClick={onDownload}
          >
            {downloading ? 'Отчёт…' : 'DOCX'}
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--small"
            title="Закрыть"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      {report?.config_errors?.length ? (
        <div className="problems-panel__config" role="status">
          <strong>Конфиг правил</strong>
          <ul>
            {report.config_errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="problems-panel__filters" aria-label="Фильтр по важности">
        {SEVERITIES.map((severity) => {
          const count =
            severity === 'error'
              ? counts.errors
              : severity === 'warning'
                ? counts.warnings
                : counts.infos;
          return (
            <button
              key={severity}
              type="button"
              className={
                filters[severity]
                  ? `problems-panel__filter problems-panel__filter--${severity} problems-panel__filter--active`
                  : `problems-panel__filter problems-panel__filter--${severity}`
              }
              aria-pressed={filters[severity]}
              onClick={() =>
                setFilters((current) => ({ ...current, [severity]: !current[severity] }))
              }
            >
              <span className="problems-panel__dot" aria-hidden="true" />
              {SEVERITY_LABEL[severity]}
              <span className="problems-panel__count">{count}</span>
            </button>
          );
        })}
      </div>

      {stale ? (
        <p className="comments-panel__hint">
          Есть несохранённые правки. Сохраните схему, чтобы проверить актуальную версию.
        </p>
      ) : null}
      {busy ? (
        <p className="comments-panel__hint" role="status" aria-live="polite">
          Проверяется…
        </p>
      ) : null}
      {error ? <p className="comments-panel__error">{error}</p> : null}

      {report && report.findings.length === 0 ? (
        <p className="comments-panel__hint">Проблем не найдено.</p>
      ) : null}
      {report && report.findings.length > 0 && visibleCount === 0 ? (
        <p className="comments-panel__hint">Нет находок с выбранными фильтрами.</p>
      ) : null}

      {report && report.findings.length > 0 ? (
        <div className="problems-panel__groups">
          {SEVERITIES.map((severity) => {
            const items = groups[severity];
            if (items.length === 0) {
              return null;
            }
            return (
              <section
                key={severity}
                className={`problems-panel__group problems-panel__group--${severity}`}
              >
                <button
                  type="button"
                  className="problems-panel__group-title"
                  aria-expanded={!collapsed[severity]}
                  onClick={() =>
                    setCollapsed((current) => ({ ...current, [severity]: !current[severity] }))
                  }
                >
                  <span className="problems-panel__dot" aria-hidden="true" />
                  {SEVERITY_LABEL[severity]}
                  <span className="problems-panel__count">{items.length}</span>
                  <span className="problems-panel__chevron" aria-hidden="true">
                    {collapsed[severity] ? '▸' : '▾'}
                  </span>
                </button>
                {collapsed[severity] ? null : (
                  <ul className="problems-panel__list">
                    {items.map((finding, index) => {
                      const element = finding.element_id
                        ? finding.element_name || finding.element_id
                        : null;
                      const current = isHighlighted(finding);
                      return (
                        <li key={`${finding.rule_id}:${finding.element_id ?? 'diagram'}:${index}`}>
                          <button
                            ref={current ? highlightedRef : undefined}
                            type="button"
                            className={current ? 'problem problem--highlighted' : 'problem'}
                            disabled={!finding.element_id}
                            title={element ? `Перейти к ${element}` : 'Ошибка уровня схемы'}
                            onClick={() => onSelect(finding)}
                          >
                            <span className="problem__message">{finding.message}</span>
                            <span className="problem__meta">
                              <code>{finding.rule_id}</code>
                              {element ? <span>{element}</span> : <span>схема</span>}
                            </span>
                            {finding.hint ? (
                              <span className="problem__hint">{finding.hint}</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {autoLayout ? null : (
        <span
          className="comments-panel__resize"
          aria-hidden="true"
          title="Изменить размер"
          {...drag.resizeHandleProps}
        />
      )}
    </section>
  );
}
