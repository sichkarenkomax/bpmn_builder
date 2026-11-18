import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createDiagram } from '../lib/api';
import { DIAGRAM_TEMPLATES, type TemplateId } from '../lib/templates';

export function TemplatePicker({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState<TemplateId>('approval');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const template = DIAGRAM_TEMPLATES.find((item) => item.id === templateId);
    if (!template) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const diagram = await createDiagram(template.title, template.build());
      navigate(`/d/${diagram.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'не удалось создать диаграмму');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? 'template-picker template-picker--compact' : 'template-picker'}>
      <label>
        <span>Шаблон</span>
        <select
          value={templateId}
          disabled={busy}
          onChange={(event) => setTemplateId(event.target.value as TemplateId)}
        >
          {DIAGRAM_TEMPLATES.map((template) => (
            <option key={template.id} value={template.id}>
              {template.title}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="ghost-button" onClick={() => void create()} disabled={busy}>
        {busy ? 'Создаю…' : 'Создать'}
      </button>
      {!compact ? (
        <span className="page__subtitle">
          {DIAGRAM_TEMPLATES.find((item) => item.id === templateId)?.description}
        </span>
      ) : null}
      {error ? <p className="canvas__overlay--error">{error}</p> : null}
    </div>
  );
}
