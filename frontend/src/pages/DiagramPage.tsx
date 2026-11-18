import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import demoXml from '../assets/demo-process.bpmn?raw';
import { DiagramEditor } from '../components/DiagramEditor';
import { TemplatePicker } from '../components/TemplatePicker';
import { useDiagram } from '../hooks/useDiagram';
import { createDiagram, updateDiagram, type DiagramSummary } from '../lib/api';

const DEMO_TITLE = 'Демонстрационный процесс';

type DiagramStatus = 'draft' | 'approved' | 'archived';

const STATUS_LABELS: Record<string, string> = {
  draft: 'черновик',
  approved: 'утверждена',
  archived: 'в архиве',
};

function normalizeStatus(value: string): DiagramStatus {
  return value === 'approved' || value === 'archived' ? value : 'draft';
}

function DiagramHeader({ meta }: { meta: DiagramSummary }) {
  const [title, setTitle] = useState(meta.title);
  const [description, setDescription] = useState(meta.description ?? '');
  const [status, setStatus] = useState<DiagramStatus>(normalizeStatus(meta.status));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(meta.title);
    setDescription(meta.description ?? '');
    setStatus(normalizeStatus(meta.status));
  }, [meta.id, meta.title, meta.description, meta.status]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const save = async () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('название не может быть пустым');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDiagram(meta.id, {
        title: nextTitle,
        description: description.trim(),
        status,
      });
      setTitle(updated.title);
      setDescription(updated.description ?? '');
      setStatus(normalizeStatus(updated.status));
      setOpen(false);
    } catch {
      setError('не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page__toolbar">
      <div>
        <h1 className="page__title">{title}</h1>
        <p className="page__subtitle">
          статус: {STATUS_LABELS[status] ?? status} · etag: <code>{meta.etag?.slice(0, 12)}</code>
        </p>
      </div>
      <div className="page__toolbar-actions">
        <button type="button" className="ghost-button" onClick={() => setOpen(true)}>
          Настройки схемы
        </button>
        <Link className="ghost-button" to="/">
          К списку
        </Link>
      </div>

      {open ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Настройки схемы"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog__header">
              <h2 className="dialog__title">Настройки схемы</h2>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Закрыть
              </button>
            </header>

            <div className="dialog-form">
              <label>
                <span>Название</span>
                <input
                  value={title}
                  maxLength={255}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                <span>Описание</span>
                <textarea
                  rows={4}
                  value={description}
                  maxLength={5000}
                  placeholder="Что описывает процесс, границы, ответственные…"
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                <span>Статус</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(normalizeStatus(event.target.value))}
                >
                  <option value="draft">Черновик</option>
                  <option value="approved">Утверждена</option>
                  <option value="archived">В архиве</option>
                </select>
              </label>
            </div>

            {error ? <p className="dialog__error">{error}</p> : null}

            <footer className="dialog__footer">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Отмена
              </button>
              <button
                type="button"
                className="ghost-button ghost-button--primary"
                onClick={() => void save()}
                disabled={saving}
              >
                {saving ? 'Сохраняю…' : 'Сохранить'}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export function DiagramPage() {
  const { diagramId = '' } = useParams<{ diagramId: string }>();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isNew = diagramId === 'new';
  const loadable = useDiagram(isNew ? null : diagramId);

  const createDemo = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const diagram = await createDiagram(DEMO_TITLE, demoXml);
      navigate(`/d/${diagram.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'не удалось создать диаграмму');
    } finally {
      setCreating(false);
    }
  };

  if (isNew) {
    return (
      <section className="page page--centered">
        <h1 className="page__title">Новая диаграмма</h1>
        <p className="page__subtitle">Выберите шаблон или начните с демонстрационного процесса.</p>
        <TemplatePicker />
        <button type="button" className="ghost-button" onClick={createDemo} disabled={creating}>
          {creating ? 'Создаю…' : 'Создать демо-процесс'}
        </button>
        {createError ? <p className="canvas__overlay--error">{createError}</p> : null}
        <Link className="ghost-button" to="/">
          К списку
        </Link>
      </section>
    );
  }

  if (loadable.state === 'loading') {
    return <section className="page page--centered">Загружаю диаграмму…</section>;
  }

  if (loadable.state === 'missing' || loadable.state === 'error') {
    return (
      <section className="page page--centered">
        <h1 className="page__title">
          {loadable.state === 'missing' ? 'Диаграмма не найдена' : 'Не удалось загрузить'}
        </h1>
        {loadable.state === 'error' ? <p className="page__subtitle">{loadable.message}</p> : null}
        <Link className="ghost-button" to="/">
          К списку
        </Link>
      </section>
    );
  }

  const { meta, xml } = loadable.data;

  return (
    <section className="page">
      <DiagramHeader meta={meta} />
      <DiagramEditor diagramId={meta.id} initialXml={xml} initialEtag={meta.etag} />
    </section>
  );
}
