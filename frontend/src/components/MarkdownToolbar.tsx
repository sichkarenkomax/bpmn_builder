import { useEffect, useRef, useState, type ReactNode } from 'react';

import { MARKDOWN_HELP, MARKDOWN_TOOLS, PRIMARY_MARKDOWN_KINDS } from '../lib/markdown-tools';
import type { FormatKind } from '../lib/markdown-toolbar';

const primaryTools = MARKDOWN_TOOLS.filter((item) => PRIMARY_MARKDOWN_KINDS.includes(item.kind));
const secondaryTools = MARKDOWN_TOOLS.filter((item) => !PRIMARY_MARKDOWN_KINDS.includes(item.kind));

/**
 * Одна строка форматирования (1.5.20): частые кнопки на виду, остальные — в
 * меню «Ещё», справка по Markdown — во всплывающей подсказке у «?».
 */
export function MarkdownToolbar({
  onFormat,
  disabled,
  children,
}: {
  onFormat: (kind: FormatKind) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moreOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);

  const apply = (kind: FormatKind) => {
    setMoreOpen(false);
    onFormat(kind);
  };

  return (
    <div className="md-toolbar" role="group" aria-label="Форматирование документации">
      {primaryTools.map((item) => (
        <button
          key={item.kind}
          type="button"
          className="docs-editor__tool"
          disabled={disabled}
          title={item.title}
          aria-label={item.title}
          onClick={() => apply(item.kind)}
        >
          {item.label}
        </button>
      ))}

      <div className="md-toolbar__more" ref={moreRef}>
        <button
          type="button"
          className="docs-editor__tool md-toolbar__more-button"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          disabled={disabled}
          onClick={() => setMoreOpen((current) => !current)}
        >
          Ещё ▾
        </button>
        {moreOpen ? (
          <div className="md-toolbar__menu" role="menu" aria-label="Ещё форматирование">
            {secondaryTools.map((item) => (
              <button
                key={item.kind}
                type="button"
                role="menuitem"
                className="md-toolbar__menu-item"
                title={item.title}
                onClick={() => apply(item.kind)}
              >
                <span className="md-toolbar__menu-icon">{item.label}</span>
                {item.title}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <span className="md-toolbar__help">
        <button
          type="button"
          className="docs-editor__tool md-toolbar__help-button"
          aria-label="Справка по Markdown"
          aria-describedby="md-toolbar-help"
        >
          ?
        </button>
        <span id="md-toolbar-help" role="tooltip" className="md-toolbar__tooltip">
          {MARKDOWN_HELP}
        </span>
      </span>

      {children ? <div className="md-toolbar__actions">{children}</div> : null}
    </div>
  );
}
