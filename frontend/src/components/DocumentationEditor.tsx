import { useEffect, useRef, useState } from 'react';

import { applyFormat, type FormatKind, type TextSelection } from '../lib/markdown-toolbar';
import { MarkdownView } from './MarkdownView';
import { MARKDOWN_TOOLS, MarkdownWindow } from './MarkdownWindow';

/** Документация элемента: Markdown с панелью форматирования и предпросмотром. */
export function DocumentationEditor({
  value,
  title,
  onChange,
}: {
  value: string;
  title?: string;
  onChange: (next: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Выделение, которое нужно восстановить после обновления value из родителя.
  const [pendingSelection, setPendingSelection] = useState<
    (TextSelection & { nonce: number }) | null
  >(null);

  useEffect(() => {
    if (!pendingSelection) {
      return;
    }
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.setSelectionRange(pendingSelection.start, pendingSelection.end);
    }
    setPendingSelection(null);
  }, [pendingSelection]);

  const format = (kind: FormatKind) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const result = applyFormat(kind, value, start, end);
    setPendingSelection({ ...result, nonce: Date.now() });
    onChange(result.value);
  };

  return (
    <div className="docs-editor">
      <div className="docs-editor__toolbar" role="group" aria-label="Форматирование документации">
        {MARKDOWN_TOOLS.map((item) => (
          <button
            key={item.kind}
            type="button"
            className="docs-editor__tool"
            disabled={preview}
            title={item.title}
            aria-label={item.title}
            onClick={() => format(item.kind)}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          className={
            preview ? 'docs-editor__preview docs-editor__preview--active' : 'docs-editor__preview'
          }
          aria-pressed={preview}
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? 'Редактирование' : 'Предпросмотр'}
        </button>
        <button
          type="button"
          className="docs-editor__preview"
          title="Открыть большое окно с предпросмотром"
          onClick={() => setExpanded(true)}
        >
          Окно
        </button>
      </div>
      {preview ? (
        <div className="docs-editor__preview-pane">
          <MarkdownView text={value} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          rows={6}
          value={value}
          placeholder="Markdown: # заголовок, **жирный**, [ссылка](https://example.com)"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      <p className="docs-editor__hint">
        Заголовки 1–6, списки и чек-листы, цитаты, таблицы, линии, блоки кода с подсветкой,
        изображения, <code>**жирный**</code>, <code>*курсив*</code>, <code>`код`</code> и{' '}
        <code>[ссылки](https://…)</code>. Вложенные списки и HTML не поддерживаются.
      </p>
      <MarkdownWindow
        open={expanded}
        title={title || 'элемент'}
        value={value}
        onChange={onChange}
        onClose={() => setExpanded(false)}
      />
    </div>
  );
}
