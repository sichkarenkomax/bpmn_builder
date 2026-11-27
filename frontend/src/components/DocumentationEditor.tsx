import { useDeferredValue, useEffect, useRef, useState } from 'react';

import { applyFormat, type FormatKind, type TextSelection } from '../lib/markdown-toolbar';
import { MarkdownToolbar } from './MarkdownToolbar';
import { MarkdownView } from './MarkdownView';
import { MarkdownWindow } from './MarkdownWindow';

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
  const previewText = useDeferredValue(value);
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
      <MarkdownToolbar onFormat={format} disabled={preview}>
        <button
          type="button"
          className={
            preview ? 'docs-editor__preview docs-editor__preview--active' : 'docs-editor__preview'
          }
          aria-pressed={preview}
          aria-label={preview ? 'Редактирование' : 'Предпросмотр'}
          title={preview ? 'Вернуться к редактированию' : 'Предпросмотр Markdown'}
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? '✎' : '👁'}
        </button>
        <button
          type="button"
          className="docs-editor__preview"
          title="Открыть большое окно с предпросмотром"
          aria-label="Окно"
          onClick={() => setExpanded(true)}
        >
          ⤢
        </button>
      </MarkdownToolbar>
      {preview ? (
        <div className="docs-editor__preview-pane">
          <MarkdownView text={previewText} />
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
