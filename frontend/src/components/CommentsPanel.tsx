import { useEffect, useRef, useState } from 'react';

import type { DiagramComment } from '../lib/api';
import { commentAuthorLabel, formatCommentTime } from '../lib/comments';
import { applyFormat, type FormatKind, type TextSelection } from '../lib/markdown-toolbar';
import { MarkdownView } from './MarkdownView';
import { MARKDOWN_TOOLS } from './MarkdownWindow';

/** Панель обсуждения выбранного элемента (1.3.8). */
export function CommentsPanel({
  elementName,
  comments,
  busy,
  error,
  onCreate,
  onToggleResolved,
  onDelete,
  onClose,
}: {
  elementName: string | null;
  comments: DiagramComment[];
  busy: boolean;
  error: string | null;
  onCreate: (body: string) => void;
  onToggleResolved: (comment: DiagramComment) => void;
  onDelete: (comment: DiagramComment) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [pendingSelection, setPendingSelection] = useState<
    (TextSelection & { nonce: number }) | null
  >(null);

  useEffect(() => {
    if (!pendingSelection) {
      return;
    }
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(pendingSelection.start, pendingSelection.end);
    }
    setPendingSelection(null);
  }, [pendingSelection]);

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || busy || !elementName) {
      return;
    }
    onCreate(trimmed);
    setBody('');
    setPreview(false);
  };

  const format = (kind: FormatKind) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const result = applyFormat(kind, body, textarea.selectionStart, textarea.selectionEnd);
    setBody(result.value);
    setPendingSelection({ ...result, nonce: Date.now() });
  };

  return (
    <section className="comments-panel" aria-label="Комментарии">
      <header className="comments-panel__header">
        <div>
          <h2 className="comments-panel__title">Комментарии</h2>
          <p className="comments-panel__element">
            {elementName ? <code>{elementName}</code> : 'элемент не выбран'}
          </p>
        </div>
        <button type="button" className="ghost-button ghost-button--small" onClick={onClose}>
          Закрыть
        </button>
      </header>

      {elementName ? null : (
        <p className="comments-panel__hint">
          Выберите элемент на холсте или нажмите на маркер с цифрой, чтобы открыть его обсуждение.
        </p>
      )}

      {elementName ? (
        <div className="comments-panel__list">
          {comments.length === 0 ? (
            <p className="comments-panel__hint">Пока нет сообщений — начните обсуждение.</p>
          ) : (
            comments.map((comment) => (
              <article
                key={comment.id}
                className={
                  comment.resolved_at ? 'comment comment--resolved' : 'comment comment--open'
                }
              >
                <header className="comment__meta">
                  <span className="comment__author">{commentAuthorLabel(comment.author_id)}</span>
                  <span className="comment__time">{formatCommentTime(comment.created_at)}</span>
                  {comment.resolved_at ? <span className="comment__badge">решено</span> : null}
                </header>
                <div className="comment__body">
                  <MarkdownView text={comment.body} />
                </div>
                <div className="comment__actions">
                  <button
                    type="button"
                    className="ghost-button ghost-button--small"
                    disabled={busy}
                    onClick={() => onToggleResolved(comment)}
                  >
                    {comment.resolved_at ? 'Вернуть' : 'Решить'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button ghost-button--small"
                    disabled={busy}
                    onClick={() => onDelete(comment)}
                  >
                    Удалить
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {error ? <p className="comments-panel__error">{error}</p> : null}

      {elementName ? (
        <div className="comments-panel__composer">
          <div
            className="comments-panel__tools"
            role="group"
            aria-label="Форматирование комментария"
          >
            {MARKDOWN_TOOLS.map((item) => (
              <button
                key={item.kind}
                type="button"
                className="docs-editor__tool"
                disabled={busy || preview}
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
                preview
                  ? 'docs-editor__preview docs-editor__preview--active'
                  : 'docs-editor__preview'
              }
              aria-pressed={preview}
              onClick={() => setPreview((current) => !current)}
            >
              {preview ? 'Редактирование' : 'Предпросмотр'}
            </button>
          </div>
          {preview ? (
            <div className="comments-panel__preview">
              <MarkdownView text={body} />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="comments-panel__input"
              aria-label="Новый комментарий"
              placeholder="Markdown: **важно**, `код`, [ссылка](https://…)"
              rows={3}
              value={body}
              disabled={busy}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          )}
          <div className="comments-panel__send">
            <span className="comments-panel__hint">Markdown · Ctrl+Enter — отправить</span>
            <button
              type="button"
              className="ghost-button ghost-button--primary ghost-button--small"
              disabled={busy || body.trim() === ''}
              onClick={submit}
            >
              Отправить
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
