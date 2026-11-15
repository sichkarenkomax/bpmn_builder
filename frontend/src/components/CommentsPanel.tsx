import { useState } from 'react';

import type { DiagramComment } from '../lib/api';
import { commentAuthorLabel, formatCommentTime } from '../lib/comments';

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

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || busy || !elementName) {
      return;
    }
    onCreate(trimmed);
    setBody('');
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
                <p className="comment__body">{comment.body}</p>
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
          <textarea
            className="comments-panel__input"
            aria-label="Новый комментарий"
            placeholder="Написать комментарий…"
            rows={2}
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
          <button
            type="button"
            className="ghost-button ghost-button--primary ghost-button--small"
            disabled={busy || body.trim() === ''}
            onClick={submit}
          >
            Отправить
          </button>
        </div>
      ) : null}
    </section>
  );
}
