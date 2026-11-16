// Минимальный Markdown для документации элемента (задача 1.3.12).
// Подмножество: заголовки, списки, абзацы, жирный/курсив/код, ссылки.
// Парсер чистый — компонент `MarkdownView` отрисовывает токены как React-элементы,
// поэтому «опасный» HTML исключён по построению: вставка разметки останется текстом.

import { isSafeUrl } from './url';

export { isSafeUrl };

export type MdInline =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; url: string };

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; inlines: MdInline[] }
  | { kind: 'list'; ordered: boolean; items: MdInline[][] }
  | { kind: 'paragraph'; inlines: MdInline[] };

const HEADING_PATTERN = /^(#{1,4})\s+(.*)$/;
const UNORDERED_PATTERN = /^[-*+]\s+(.*)$/;
const ORDERED_PATTERN = /^\d{1,3}[.)]\s+(.*)$/;
const INLINE_PATTERN =
  /(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(`([^`\n]+)`)|(\[([^\]\n]*)]\(([^)\s]+)\))/g;

/** Разбирает одну строку инлайновой разметки в плоский список токенов. */
export function parseInline(line: string): MdInline[] {
  const tokens: MdInline[] = [];
  let plain = '';
  let cursor = 0;

  const flushPlain = () => {
    if (plain !== '') {
      tokens.push({ kind: 'text', value: plain });
      plain = '';
    }
  };

  for (const match of matchAll(INLINE_PATTERN, line)) {
    const start = match.index;
    if (start > cursor) {
      plain += line.slice(cursor, start);
    }
    cursor = match.index + match[0].length;
    if (match[2] !== undefined) {
      flushPlain();
      tokens.push({ kind: 'strong', value: match[2] });
    } else if (match[4] !== undefined) {
      flushPlain();
      tokens.push({ kind: 'em', value: match[4] });
    } else if (match[6] !== undefined) {
      flushPlain();
      tokens.push({ kind: 'code', value: match[6] });
    } else if (match[8] !== undefined) {
      const url = match[9] ?? '';
      flushPlain();
      tokens.push({ kind: 'link', value: match[8] === '' ? url : match[8], url });
    }
  }

  if (cursor < line.length) {
    plain += line.slice(cursor);
  }
  flushPlain();
  return tokens;
}

/** Разбирает документ в блоки: заголовки, списки, абзацы. */
export function parseMarkdown(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
      paragraph.length = 0;
    }
  };

  for (const line of text.split('\n')) {
    const heading = HEADING_PATTERN.exec(line);
    const unordered = UNORDERED_PATTERN.exec(line);
    const ordered = ORDERED_PATTERN.exec(line);

    if (heading) {
      const level = heading[1] ?? '';
      const content = heading[2] ?? '';
      flushParagraph();
      blocks.push({
        kind: 'heading',
        level: level.length as 1 | 2 | 3 | 4,
        inlines: parseInline(content),
      });
      continue;
    }

    if (unordered || ordered) {
      flushParagraph();
      const value = (unordered ?? ordered)?.[1] ?? '';
      const last = blocks[blocks.length - 1];
      const orderedList = Boolean(ordered);
      if (last && last.kind === 'list' && last.ordered === orderedList) {
        last.items.push(parseInline(value));
      } else {
        blocks.push({ kind: 'list', ordered: orderedList, items: [parseInline(value)] });
      }
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

function matchAll(pattern: RegExp, text: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  while (match) {
    matches.push(match);
    match = pattern.exec(text);
  }
  return matches;
}
