import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import demoXml from '../assets/demo-process.bpmn?raw';
import { DiagramEditor } from '../components/DiagramEditor';
import { TemplatePicker } from '../components/TemplatePicker';
import { useDiagram } from '../hooks/useDiagram';
import {
  createDiagram,
  fetchValidation,
  updateDiagram,
  type DiagramSummary,
  type ValidationReport,
} from '../lib/api';
import { withPortalDefaults } from '../lib/portal-defaults';

const DEMO_TITLE = 'Демонстрационный процесс';

type DiagramStatus = 'draft' | 'approved' | 'archived';

const STATUS_LABELS: Record<string, string> = {
  draft: 'черновик',
  approved: 'утверждена',
  archived: 'в архиве',
};

const SEVERITY_LABELS: Record<string, string> = {
  error: 'ошибка',
  warning: 'предупреждение',
  info: 'информация',
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
  const [validationOpen, setValidationOpen] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(meta.title);
    setDescription(meta.description ?? '');
    setStatus(normalizeStatus(meta.status));
  }, [meta.id, meta.title, meta.description, meta.status]);

  useEffect(() => {
    if (!open && !validationOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setValidationOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, validationOpen]);

  const check = async () => {
    setValidationOpen(true);
    setValidation(null);
    setValidationLoading(true);
    setValidationError(null);
    try {
      setValidation(await fetchValidation(meta.id));
    } catch {
      setValidation(null);
      setValidationError('не удалось выполнить проверку');
    } finally {
      setValidationLoading(false);
    }
  };

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
    <div className="page-head page-head--diagram">
      <div className="page-head__text">
        <span className="page-head__eyebrow">Диаграмма процесса</span>
        <h1 className="page-head__title">{title}</h1>
        <p className="page-head__meta">
          <span className={`diagram-card__status diagram-card__status--${status}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            etag: <code>{meta.etag?.slice(0, 12)}</code>
          </span>
        </p>
      </div>
      <div className="page-head__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => void check()}
          disabled={validationLoading}
        >
          {validationLoading ? 'Проверяю…' : 'Проверить'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(true)}>
          Настройки схемы
        </button>
        <Link className="btn btn--ghost" to="/">
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

      {validationOpen ? (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => setValidationOpen(false)}
        >
          <section
            className="dialog dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Проверка BPMN"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="dialog__header">
              <h2 className="dialog__title">Проверка BPMN</h2>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setValidationOpen(false)}
              >
                Закрыть
              </button>
            </header>

            <p className="dialog__hint">Проверяется сохранённая версия диаграммы.</p>

            {validationLoading ? <p className="dialog__hint">Выполняю проверку…</p> : null}
            {validationError ? <p className="dialog__error">{validationError}</p> : null}

            {validation ? (
              <>
                <p
                  className={
                    validation.valid ? 'validation-summary' : 'validation-summary is-invalid'
                  }
                >
                  {validation.valid ? 'Ошибок нет' : `Ошибок: ${validation.summary.errors}`}
                  {` · предупреждений: ${validation.summary.warnings}`}
                  {` · ${Math.round(validation.duration_ms)} мс`}
                </p>

                {validation.findings.length === 0 ? (
                  <p className="dialog__hint">Замечаний нет.</p>
                ) : (
                  <ul className="validation-list">
                    {validation.findings.map((finding, index) => (
                      <li
                        key={`${finding.rule_id}-${finding.element_id ?? 'xml'}-${index}`}
                        className={`validation-item validation-item--${finding.severity}`}
                      >
                        <div className="validation-item__head">
                          <code>{finding.rule_id}</code>
                          <span>{SEVERITY_LABELS[finding.severity] ?? finding.severity}</span>
                        </div>
                        <p className="validation-item__message">{finding.message}</p>
                        {finding.element_name || finding.element_id ? (
                          <p className="validation-item__meta">
                            элемент: {finding.element_name ?? 'без имени'}
                            {finding.element_id ? ` (${finding.element_id})` : ''}
                          </p>
                        ) : null}
                        {finding.hint ? (
                          <p className="validation-item__meta">{finding.hint}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
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
      const diagram = await createDiagram(DEMO_TITLE, withPortalDefaults(demoXml));
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
        <div className="empty-state">
          <span className="page-head__eyebrow">Новый процесс</span>
          <h1 className="page-head__title">Новая диаграмма</h1>
          <p className="empty-state__text">
            Выберите шаблон или начните с демонстрационного процесса.
          </p>
          <TemplatePicker />
          <button
            type="button"
            className="btn btn--primary"
            onClick={createDemo}
            disabled={creating}
          >
            {creating ? 'Создаю…' : 'Создать демо-процесс'}
          </button>
          {createError ? <p className="page-error">{createError}</p> : null}
          <Link className="btn btn--ghost" to="/">
            К списку
          </Link>
        </div>
      </section>
    );
  }

  if (loadable.state === 'loading') {
    return (
      <section className="page page--centered">
        <p className="empty-state__text">Загружаю диаграмму…</p>
      </section>
    );
  }

  if (loadable.state === 'missing' || loadable.state === 'error') {
    return (
      <section className="page page--centered">
        <div className="empty-state">
          <span className="page-head__eyebrow">Диаграмма</span>
          <h1 className="page-head__title">
            {loadable.state === 'missing' ? 'Диаграмма не найдена' : 'Не удалось загрузить'}
          </h1>
          {loadable.state === 'error' ? (
            <p className="empty-state__text">{loadable.message}</p>
          ) : null}
          <Link className="btn btn--primary" to="/">
            К списку
          </Link>
        </div>
      </section>
    );
  }

  const { meta, xml } = loadable.data;

  return (
    <section className="page page--diagram">
      <DiagramHeader meta={meta} />
      <DiagramEditor diagramId={meta.id} initialXml={xml} initialEtag={meta.etag} />
    </section>
  );
}
