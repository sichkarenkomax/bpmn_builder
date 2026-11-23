import { useMemo, useState } from 'react';

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
  onClose,
}: {
  report: ValidationReport | null;
  stale: boolean;
  busy: boolean;
  error: string | null;
  onSelect: (finding: ValidationFinding) => void;
  onClose: () => void;
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

  return (
    <section className="comments-panel problems-panel" aria-label="Проблемы">
      <header className="comments-panel__header">
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
        <button type="button" className="ghost-button ghost-button--small" onClick={onClose}>
          Закрыть
        </button>
      </header>

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
                      return (
                        <li key={`${finding.rule_id}:${finding.element_id ?? 'diagram'}:${index}`}>
                          <button
                            type="button"
                            className="problem"
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
    </section>
  );
}
