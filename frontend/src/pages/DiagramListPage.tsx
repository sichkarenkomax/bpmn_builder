import { useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import demoXml from '../assets/demo-process.bpmn?raw';
import { useDiagramList } from '../hooks/useDiagram';
import { ApiError, createDiagram } from '../lib/api';
import { withPortalDefaults } from '../lib/portal-defaults';
import { TemplatePicker } from '../components/TemplatePicker';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

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
    <section className="page">
      <div className="page__toolbar">
        <div>
          <h1 className="page__title">Диаграммы</h1>
          <p className="page__subtitle">сохраняются в API с историей версий</p>
        </div>
        <div className="page__toolbar-actions">
          <TemplatePicker compact />
          <button
            type="button"
            className="ghost-button"
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
            className="ghost-button"
            onClick={createDemo}
            disabled={creating || importing}
          >
            {creating ? 'Создаю…' : 'Демо-процесс'}
          </button>
        </div>
      </div>

      {error ? <p className="canvas__overlay--error">{error}</p> : null}
      {loadable.state === 'loading' ? <p className="page__subtitle">Загружаю…</p> : null}
      {loadable.state === 'error' ? (
        <p className="canvas__overlay--error">API недоступен: {loadable.message}</p>
      ) : null}

      {loadable.state === 'ready' && loadable.data.items.length === 0 ? (
        <p className="page__subtitle">
          Пока пусто. Создайте демо-процесс — он сохранится в API как настоящая диаграмма.
        </p>
      ) : null}

      {loadable.state === 'ready' && loadable.data.items.length > 0 ? (
        <ul className="diagram-list">
          {loadable.data.items.map((diagram) => (
            <li key={diagram.id} className="diagram-list__item">
              <Link className="diagram-list__link" to={`/d/${diagram.id}`}>
                {diagram.title}
              </Link>
              <span className="diagram-list__meta">
                {diagram.description ? `${diagram.description} · ` : ''}
                {diagram.status} · {new Date(diagram.updated_at).toLocaleString('ru-RU')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
