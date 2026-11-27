import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import demoXml from '../assets/demo-process.bpmn?raw';
import { DiagramEditor } from '../components/DiagramEditor';
import { useDiagram } from '../hooks/useDiagram';
import { createDiagram, updateDiagram, type DiagramSummary } from '../lib/api';
import { buildEmptyDiagram } from '../lib/empty-diagram';
import { withPortalDefaults } from '../lib/portal-defaults';

const DEMO_TITLE = 'Демонстрационный процесс';

type DiagramStatus = 'draft' | 'approved' | 'archived';

type MetaDraft = {
  title: string;
  description: string;
  status: DiagramStatus;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'черновик',
  approved: 'утверждена',
  archived: 'в архиве',
};

function normalizeStatus(value: string): DiagramStatus {
  return value === 'approved' || value === 'archived' ? value : 'draft';
}

function draftFromMeta(meta: DiagramSummary): MetaDraft {
  return {
    title: meta.title,
    description: meta.description ?? '',
    status: normalizeStatus(meta.status),
  };
}

function DiagramHeader({
  meta,
  draft,
  onOpenSettings,
  onCheck,
}: {
  meta: DiagramSummary;
  draft: MetaDraft;
  onOpenSettings: () => void;
  onCheck: () => void;
}) {
  return (
    <div className="page-head page-head--diagram">
      <div className="page-head__text">
        <span className="page-head__eyebrow">Диаграмма процесса</span>
        <h1 className="page-head__title">{draft.title}</h1>
        <p className="page-head__meta">
          <span className={`diagram-card__status diagram-card__status--${draft.status}`}>
            {STATUS_LABELS[draft.status] ?? draft.status}
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
          aria-label="Проверить схему"
          onClick={onCheck}
        >
          Проверить
        </button>
        <button type="button" className="btn btn--ghost" onClick={onOpenSettings}>
          Настройки схемы
        </button>
        <Link className="btn btn--ghost" to="/">
          К списку
        </Link>
      </div>
    </div>
  );
}

function DiagramWorkspace({ meta, xml }: { meta: DiagramSummary; xml: string }) {
  const [draft, setDraft] = useState<MetaDraft>(() => draftFromMeta(meta));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [validateSignal, setValidateSignal] = useState(0);

  useEffect(() => {
    setDraft({
      title: meta.title,
      description: meta.description ?? '',
      status: normalizeStatus(meta.status),
    });
  }, [meta.id, meta.title, meta.description, meta.status]);

  const save = async () => {
    const nextTitle = draft.title.trim();
    if (!nextTitle) {
      setError('название не может быть пустым');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateDiagram(meta.id, {
        title: nextTitle,
        description: draft.description.trim(),
        status: draft.status,
      });
      setDraft(draftFromMeta(updated));
      setSettingsOpen(false);
    } catch {
      setError('не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DiagramHeader
        meta={meta}
        draft={draft}
        onOpenSettings={() => setSettingsOpen(true)}
        onCheck={() => setValidateSignal((value) => value + 1)}
      />
      <DiagramEditor
        diagramId={meta.id}
        initialXml={xml}
        initialEtag={meta.etag}
        settingsOpen={settingsOpen}
        onSettingsOpen={() => setSettingsOpen(true)}
        onSettingsClose={() => setSettingsOpen(false)}
        validateSignal={validateSignal}
        metaDraft={draft}
        metaSaving={saving}
        metaError={error}
        onMetaChange={(patch) => {
          setDraft((current) => ({ ...current, ...patch }));
          setError(null);
        }}
        onMetaSave={() => void save()}
      />
    </>
  );
}

export function DiagramPage() {
  const { diagramId = '' } = useParams<{ diagramId: string }>();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const isNew = diagramId === 'new';
  const loadable = useDiagram(isNew ? null : diagramId);

  const create = async (title: string, xml: string) => {
    setCreating(true);
    setCreateError(null);
    try {
      const diagram = await createDiagram(title, withPortalDefaults(xml));
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
            Начните с чистого холста или откройте демонстрационный процесс с готовой схемой.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void create('Новый процесс', buildEmptyDiagram())}
            disabled={creating}
          >
            {creating ? 'Создаю…' : 'Создать пустую диаграмму'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void create(DEMO_TITLE, demoXml)}
            disabled={creating}
          >
            Демо-процесс
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
      <DiagramWorkspace meta={meta} xml={xml} />
    </section>
  );
}
