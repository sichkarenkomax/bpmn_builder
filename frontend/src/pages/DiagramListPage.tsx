import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import demoXml from '../assets/demo-process.bpmn?raw';
import { useDiagramList } from '../hooks/useDiagram';
import { ApiError, createDiagram } from '../lib/api';
import { withPortalDefaults } from '../lib/portal-defaults';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  approved: 'Утверждена',
  archived: 'В архиве',
};

function statusClass(value: string): string {
  return value === 'approved' || value === 'archived' ? value : 'draft';
}

function importTitle(fileName: string): string {
  const base = fileName.replace(/\.(bpmn|xml)$/i, '').trim();
  return (base || 'Импортированный процесс').slice(0, 255);
}

function importErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError) {
    const payload = reason.detail as
      | {
          detail?: {
            code?: string;
            message?: string;
            line?: number | null;
            column?: number | null;
          };
        }
      | undefined;
    const detail = payload?.detail;
    if (detail?.message) {
      const position = detail.line
        ? ` (строка ${detail.line}${detail.column ? `, колонка ${detail.column}` : ''})`
        : '';
      return `${detail.message}${position}`;
    }
    if (detail?.code) {
      return `Импорт отклонён: ${detail.code}`;
    }
  }
  return reason instanceof Error ? reason.message : 'не удалось импортировать BPMN';
}

export function DiagramListPage() {
  const loadable = useDiagramList();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const createDemo = async () => {
    setCreating(true);
    setError(null);
    try {
      const diagram = await createDiagram('Демонстрационный процесс', withPortalDefaults(demoXml));
      navigate(`/d/${diagram.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'не удалось создать диаграмму');
    } finally {
      setCreating(false);
    }
  };

  const importBpmn = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_IMPORT_BYTES) {
      setError('Файл больше 5 МиБ');
      return;
    }

    setImporting(true);
    setError(null);
    try {
      const xml = await file.text();
      const diagram = await createDiagram(importTitle(file.name), xml);
      navigate(`/d/${diagram.id}`);
    } catch (reason) {
      setError(importErrorMessage(reason));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="page page--list">
      <header className="page-head">
        <div className="page-head__text">
          <span className="page-head__eyebrow">Библиотека процессов</span>
          <h1 className="page-head__title">Диаграммы</h1>
          <p className="page-head__subtitle">
            Модели, версии и прогоны в одном рабочем пространстве
          </p>
        </div>
        <div className="page-head__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => importInput.current?.click()}
            disabled={creating || importing}
          >
            {importing ? 'Импортирую…' : 'Импорт BPMN'}
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".bpmn,.xml,application/xml,text/xml"
            aria-label="Импортировать BPMN-файл"
            hidden
            onChange={importBpmn}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={createDemo}
            disabled={creating || importing}
          >
            {creating ? 'Создаю…' : 'Демо-процесс'}
          </button>
        </div>
      </header>

      {error ? <p className="page-error">{error}</p> : null}
      {loadable.state === 'loading' ? (
        <div className="empty-state">
          <p className="empty-state__text">Загружаю диаграммы…</p>
        </div>
      ) : null}
      {loadable.state === 'error' ? (
        <p className="page-error">API недоступен: {loadable.message}</p>
      ) : null}

      {loadable.state === 'ready' && loadable.data.items.length === 0 ? (
        <div className="empty-state">
          <h2 className="empty-state__title">Пока пусто</h2>
          <p className="empty-state__text">
            Создайте демо-процесс или импортируйте BPMN — диаграмма сохранится в API с историей
            версий.
          </p>
        </div>
      ) : null}

      {loadable.state === 'ready' && loadable.data.items.length > 0 ? (
        <ul className="diagram-grid">
          {loadable.data.items.map((diagram) => {
            const status = statusClass(diagram.status);
            return (
              <li key={diagram.id} className="diagram-card">
                <Link className="diagram-card__link" to={`/d/${diagram.id}`}>
                  <div className="diagram-card__top">
                    <span className={`diagram-card__status diagram-card__status--${status}`}>
                      {STATUS_LABELS[status]}
                    </span>
                    <span className="diagram-card__arrow" aria-hidden="true">
                      →
                    </span>
                  </div>
                  <h2 className="diagram-card__title" title={diagram.title}>
                    {diagram.title}
                  </h2>
                  {diagram.description ? (
                    <p className="diagram-card__description">{diagram.description}</p>
                  ) : null}
                  <footer className="diagram-card__footer">
                    <span>
                      обновлено{' '}
                      {new Date(diagram.updated_at).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="diagram-card__id">#{diagram.id.slice(0, 8)}</span>
                  </footer>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
