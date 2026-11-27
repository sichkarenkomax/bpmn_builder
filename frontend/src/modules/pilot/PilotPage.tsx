import { useEffect, useState, type FormEvent } from 'react';

import { ApiError } from '../../lib/api';
import { createNote, deleteNote, listNotes, type PilotNote } from './api';

function errorText(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 404) {
    return 'Модуль pilot выключен на сервере (MODULES_ENABLED).';
  }
  return reason instanceof Error ? reason.message : 'не удалось загрузить заметки';
}

/** Страница пилотного модуля: отдельный чанк и собственный API-клиент (4.0.5). */
export function PilotPage() {
  const [notes, setNotes] = useState<PilotNote[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listNotes(controller.signal)
      .then(setNotes)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorText(reason));
        }
      });
    return () => controller.abort();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const note = await createNote(title, body);
      setNotes((current) => [...current, note]);
      setTitle('');
      setBody('');
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page page--list">
      <header className="page-head">
        <div className="page-head__text">
          <span className="page-head__eyebrow">Модуль</span>
          <h1 className="page-head__title">Пилотный модуль</h1>
        </div>
      </header>

      {error ? <p className="page-error">{error}</p> : null}

      <form className="module-form" onSubmit={submit}>
        <input
          aria-label="Заголовок заметки"
          value={title}
          placeholder="Заголовок"
          maxLength={255}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          aria-label="Текст заметки"
          value={body}
          placeholder="Текст (необязательно)"
          onChange={(event) => setBody(event.target.value)}
        />
        <button type="submit" className="ghost-button ghost-button--primary" disabled={busy}>
          Добавить
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="empty-state__text">Заметок пока нет.</p>
      ) : (
        <ul className="module-notes">
          {notes.map((note) => (
            <li key={note.id} className="module-note">
              <div>
                <strong>{note.title}</strong>
                {note.body ? <p>{note.body}</p> : null}
              </div>
              <button
                type="button"
                className="ghost-button ghost-button--small"
                aria-label={`Удалить заметку «${note.title}»`}
                onClick={async () => {
                  try {
                    await deleteNote(note.id);
                    setNotes((current) => current.filter((item) => item.id !== note.id));
                  } catch (reason) {
                    setError(errorText(reason));
                  }
                }}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
