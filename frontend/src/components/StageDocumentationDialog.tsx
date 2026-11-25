import { useEffect, useState } from 'react';

import type { DiagramStage } from '../lib/stages';
import { DocumentationEditor } from './DocumentationEditor';

/**
 * Документация этапа (1.5.7): Markdown хранится в `bs:stages`, пустое
 * значение удаляет описание. Правки применяются по кнопке, чтобы не писать
 * XML на каждое нажатие клавиши.
 */
export function StageDocumentationDialog({
  stage,
  onSave,
  onClose,
}: {
  stage: DiagramStage | null;
  onSave: (stage: DiagramStage, description: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(stage?.description ?? '');
  }, [stage]);

  useEffect(() => {
    if (!stage) {
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
  }, [stage, onClose]);

  if (!stage) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Документация этапа «${stage.name}»`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Документация этапа «{stage.name}»</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          Markdown хранится в схеме вместе с этапом и виден в подсказке кнопки ⓘ. Пустое поле
          удаляет документацию.
        </p>

        <DocumentationEditor value={draft} title={`этап «${stage.name}»`} onChange={setDraft} />

        <footer className="dialog__footer">
          <button
            type="button"
            className="ghost-button ghost-button--primary"
            onClick={() => {
              onSave(stage, draft);
              onClose();
            }}
          >
            Сохранить
          </button>
        </footer>
      </section>
    </div>
  );
}
