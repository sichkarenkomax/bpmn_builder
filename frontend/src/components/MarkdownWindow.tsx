import { useEffect, useRef, useState } from 'react';

import { applyFormat, type FormatKind, type TextSelection } from '../lib/markdown-toolbar';
import { MarkdownView } from './MarkdownView';

export const MARKDOWN_TOOLS: { kind: FormatKind; label: string; title: string }[] = [
  { kind: 'bold', label: 'Ж', title: 'Жирный (**текст**)' },
  { kind: 'italic', label: 'К', title: 'Курсив (*текст*)' },
  { kind: 'code', label: '‹›', title: 'Код (`текст`)' },
  { kind: 'heading', label: 'З', title: 'Заголовок (## текст)' },
  { kind: 'bulletList', label: '•—', title: 'Маркированный список' },
  { kind: 'orderedList', label: '1.', title: 'Нумерованный список' },
  { kind: 'link', label: '🔗', title: 'Ссылка [текст](url)' },
];

/** Большое окно документации (1.3.23): поле ввода и предпросмотр рядом. */
export function MarkdownWindow({
  open,
  title,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  title: string;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState(value);
  const [pendingSelection, setPendingSelection] = useState<
    (TextSelection & { nonce: number }) | null
  >(null);

  useEffect(() => {
    if (open) {
      setDraft(value);
    }
  }, [open, value]);

  useEffect(() => {
    if (!open) {
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
  }, [open, onClose]);

  useEffect(() => {
    if (!pendingSelection) {
      return;
    }
    textareaRef.current?.setSelectionRange(pendingSelection.start, pendingSelection.end);
    setPendingSelection(null);
  }, [pendingSelection]);

  if (!open) {
    return null;
  }

  const format = (kind: FormatKind) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const result = applyFormat(
      kind,
      draft,
      textarea.selectionStart,
      textarea.selectionEnd,
    );
    setDraft(result.value);
    setPendingSelection({ ...result, nonce: Date.now() });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog dialog--markdown"
        role="dialog"
        aria-modal="true"
        aria-label="Документация элемента"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Документация: {title}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div className="docs-window__toolbar" role="group" aria-label="Форматирование документации">
          {MARKDOWN_TOOLS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className="docs-editor__tool"
              title={item.title}
              aria-label={item.title}
              onClick={() => format(item.kind)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="docs-window__body">
          <label className="docs-window__pane">
            <span className="docs-window__caption">Markdown</span>
            <textarea
              ref={textareaRef}
              aria-label="Текст документации"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="# Заголовок&#10;&#10;- пункт списка&#10;&#10;**жирный**, *курсив*, `код`, [ссылка](https://example.com)"
            />
          </label>
          <div className="docs-window__pane">
            <span className="docs-window__caption">Предпросмотр</span>
            <div className="docs-window__preview">
              <MarkdownView text={draft} />
            </div>
          </div>
        </div>

        <p className="docs-editor__hint">
          Поддерживается: заголовки <code>#</code>, списки, <code>**жирный**</code>,{' '}
          <code>*курсив*</code>, <code>`код`</code> и <code>[ссылки](https://…)</code>.
        </p>

        <footer className="dialog__footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--primary"
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Применить
          </button>
        </footer>
      </section>
    </div>
  );
}
