import { isSafeUrl, parseMarkdown, type MdBlock, type MdInline } from '../lib/markdown';

/** Отрисовка Markdown-токенов как React-элементов — без innerHTML, вставленная разметка остаётся текстом. */
export function MarkdownView({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) {
    return <p className="md-doc md-doc--empty">Пока пусто.</p>;
  }
  return <div className="md-doc">{blocks.map((block, index) => renderBlock(block, index))}</div>;
}

function renderBlock(block: MdBlock, key: number) {
  switch (block.kind) {
    case 'heading': {
      const content = block.inlines.map(renderInline);
      if (block.level === 1) {
        return <h3 key={key}>{content}</h3>;
      }
      if (block.level === 2) {
        return <h4 key={key}>{content}</h4>;
      }
      if (block.level === 3) {
        return <h5 key={key}>{content}</h5>;
      }
      return <h6 key={key}>{content}</h6>;
    }
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag key={key}>
          {block.items.map((item, index) => (
            <li key={index}>{item.map(renderInline)}</li>
          ))}
        </Tag>
      );
    }
    case 'paragraph':
      return <p key={key}>{block.inlines.map(renderInline)}</p>;
  }
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
        <a key={key} href={token.url} target="_blank" rel="noreferrer">
          {token.value}
        </a>
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
