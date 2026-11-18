import { useDeferredValue, useEffect, useRef, useState } from 'react';

import { applyFormat, type FormatKind, type TextSelection } from '../lib/markdown-toolbar';
import { MarkdownView } from './MarkdownView';

export const MARKDOWN_TOOLS: { kind: FormatKind; label: string; title: string }[] = [
  { kind: 'bold', label: 'Ж', title: 'Жирный (**текст**)' },
  { kind: 'italic', label: 'К', title: 'Курсив (*текст*)' },
  { kind: 'code', label: '‹›', title: 'Код (`текст`)' },
  { kind: 'heading', label: 'З', title: 'Заголовок (## текст)' },
  { kind: 'quote', label: '❝', title: 'Цитата (> текст)' },
  { kind: 'bulletList', label: '•—', title: 'Маркированный список' },
  { kind: 'orderedList', label: '1.', title: 'Нумерованный список' },
  { kind: 'checklist', label: '☑', title: 'Чек-лист (- [ ] пункт)' },
  { kind: 'link', label: '🔗', title: 'Ссылка [текст](url)' },
  { kind: 'image', label: '🖼', title: 'Изображение ![описание](url)' },
  { kind: 'codeBlock', label: '{ }', title: 'Блок кода (```)' },
  { kind: 'table', label: '▦', title: 'Таблица' },
  { kind: 'hr', label: '—', title: 'Горизонтальная линия' },
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
  const dirtyRef = useRef(false);
  const [draft, setDraft] = useState(value);
  const [showPreview, setShowPreview] = useState(true);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previewText = useDeferredValue(draft);
  const [pendingSelection, setPendingSelection] = useState<
    (TextSelection & { nonce: number }) | null
  >(null);

  useEffect(() => {
    if (!open) {
      dirtyRef.current = false;
      setDraft(value);
      return;
    }
    // Пока пользователь не начал править черновик, подхватываем актуальное
    // значение: инспектор может получить документацию уже после открытия окна.
    if (!dirtyRef.current) {
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

  const resizeBy = (deltaX: number, deltaY: number) => {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    setSize({
      width: Math.max(520, Math.min(window.innerWidth - 40, rect.width + deltaX)),
      height: Math.max(380, Math.min(window.innerHeight - 40, rect.height + deltaY)),
    });
  };

  const format = (kind: FormatKind) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    const result = applyFormat(kind, draft, textarea.selectionStart, textarea.selectionEnd);
    dirtyRef.current = true;
    setDraft(result.value);
    setPendingSelection({ ...result, nonce: Date.now() });
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="dialog dialog--markdown"
        role="dialog"
        aria-modal="true"
        aria-label="Документация элемента"
        style={size ?? undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Документация: {title}</h2>
          <div className="docs-window__actions">
            <button
              type="button"
              className={showPreview ? 'ghost-button ghost-button--active' : 'ghost-button'}
              aria-pressed={showPreview}
              title="Показать или скрыть предпросмотр"
              onClick={() => setShowPreview((current) => !current)}
            >
              Предпросмотр
            </button>
            <button type="button" className="ghost-button" onClick={onClose}>
              Закрыть
            </button>
          </div>
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

        <div
          className={
            showPreview ? 'docs-window__body' : 'docs-window__body docs-window__body--single'
          }
        >
          <label className="docs-window__pane">
            <span className="docs-window__caption">Markdown</span>
            <textarea
              ref={textareaRef}
              aria-label="Текст документации"
              value={draft}
              onChange={(event) => {
                dirtyRef.current = true;
                setDraft(event.target.value);
              }}
              placeholder="# Заголовок&#10;&#10;- пункт списка&#10;&#10;**жирный**, *курсив*, `код`, [ссылка](https://example.com)"
            />
          </label>
          {showPreview ? (
            <div className="docs-window__pane">
              <span className="docs-window__caption">Предпросмотр</span>
              <div className="docs-window__preview">
                <MarkdownView text={previewText} />
              </div>
            </div>
          ) : null}
        </div>

        <p className="docs-editor__hint">
          Заголовки 1–6, списки и чек-листы, цитаты, таблицы, линии, блоки кода с подсветкой,
          изображения, <code>**жирный**</code>, <code>*курсив*</code>, <code>`код`</code> и{' '}
          <code>[ссылки](https://…)</code>. HTML не исполняется.
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
        <button
          type="button"
          className="dialog-resize-handle"
          aria-label="Изменить размер окна стрелками, Shift — крупнее"
          title="Размер: стрелки, Shift — крупнее"
          onKeyDown={(event) => {
            const step = event.shiftKey ? 60 : 20;
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const move = moves[event.key];
            if (!move) {
              return;
            }
            event.preventDefault();
            resizeBy(move[0], move[1]);
          }}
        >
          ↘
        </button>
      </section>
    </div>
  );
}
