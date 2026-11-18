import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import demoXml from '../assets/demo-process.bpmn?raw';
import { useDiagramList } from '../hooks/useDiagram';
import { createDiagram } from '../lib/api';
import { withPortalDefaults } from '../lib/portal-defaults';
import { TemplatePicker } from '../components/TemplatePicker';

export function DiagramListPage() {
  const loadable = useDiagramList();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="page">
      <div className="page__toolbar">
        <div>
          <h1 className="page__title">Диаграммы</h1>
          <p className="page__subtitle">сохраняются в API с историей версий</p>
        </div>
        <div className="page__toolbar-actions">
          <TemplatePicker compact />
          <button type="button" className="ghost-button" onClick={createDemo} disabled={creating}>
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
