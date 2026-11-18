import { useMemo } from 'react';

import { highlightCode } from '../lib/code-highlight';
import { isSafeUrl, parseMarkdown, type MdBlock, type MdInline } from '../lib/markdown';
import { isAllowedImageUrl } from '../lib/url';

/** Отрисовка Markdown-токенов как React-элементов — без innerHTML, поэтому HTML остаётся текстом. */
export function MarkdownView({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  if (blocks.length === 0) {
    return <p className="md-doc md-doc--empty">Пока пусто.</p>;
  }
  return <div className="md-doc">{blocks.map((block, index) => renderBlock(block, index))}</div>;
}

function renderBlock(block: MdBlock, key: number) {
  switch (block.kind) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={key}>{block.inlines.map(renderInline)}</Tag>;
    }
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          key={key}
          className={block.items.some((item) => item.checked !== null) ? 'md-checklist' : undefined}
        >
          {block.items.map((item, index) => (
            <li key={index} className={item.checked === null ? undefined : 'md-checklist__item'}>
              {item.checked === null ? (
                item.inlines.map(renderInline)
              ) : (
                <>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    readOnly
                    disabled
                    aria-label={item.checked ? 'выполнено' : 'не выполнено'}
                  />
                  <span>{item.inlines.map(renderInline)}</span>
                </>
              )}
            </li>
          ))}
        </Tag>
      );
    }
    case 'paragraph':
      return <p key={key}>{block.inlines.map(renderInline)}</p>;
    case 'blockquote':
      return (
        <blockquote key={key}>
          {block.blocks.map((child, index) => renderBlock(child, index))}
        </blockquote>
      );
    case 'code':
      return (
        <pre key={key} className="md-code">
          <code>
            {highlightCode(block.code, block.language).map((token, index) => (
              <span key={index} className={`md-code__${token.kind}`}>
                {token.text}
              </span>
            ))}
          </code>
        </pre>
      );
    case 'hr':
      return <hr key={key} />;
    case 'table':
      return (
        <div key={key} className="md-table-wrap">
          <table>
            <thead>
              <tr>
                {block.headers.map((cell, index) => (
                  <th key={index} style={alignStyle(block.align[index])}>
                    {cell.map(renderInline)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={alignStyle(block.align[cellIndex])}>
                      {cell.map(renderInline)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function alignStyle(align: 'left' | 'center' | 'right' | null | undefined) {
  return align ? { textAlign: align } : undefined;
}

function renderInline(token: MdInline, key: number) {
  switch (token.kind) {
    case 'strong':
      return <strong key={key}>{token.value}</strong>;
    case 'em':
      return <em key={key}>{token.value}</em>;
    case 'code':
      return <code key={key}>{token.value}</code>;
    case 'link': {
      if (!isSafeUrl(token.url)) {
        return <span key={key}>{token.value}</span>;
      }
      return (
        <a key={key} href={token.url} target="_blank" rel="noreferrer noopener">
          {token.value}
        </a>
      );
    }
    case 'image': {
      if (!isAllowedImageUrl(token.url)) {
        return <span key={key}>{token.value}</span>;
      }
      return (
        <img
          key={key}
          className="md-image"
          src={token.url}
          alt={token.value}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      );
    }
    case 'text':
      return (
        <span key={key} style={{ whiteSpace: 'pre-line' }}>
          {token.value}
        </span>
      );
  }
}
