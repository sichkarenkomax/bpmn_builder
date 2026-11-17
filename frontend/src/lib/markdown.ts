// Markdown для документации и комментариев.
// Поддерживается безопасное подмножество: заголовки 1–6, абзацы, списки и
// чек-листы, цитаты, горизонтальные линии, таблицы, блоки кода, изображения,
// ссылки и инлайн-форматирование. HTML намеренно не исполняется: парсер отдаёт
// токены, а `MarkdownView` рисует их React-элементами.

import { isSafeUrl } from './url';

export { isSafeUrl };

export type MdInline =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'em'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'link'; value: string; url: string }
  | { kind: 'image'; value: string; url: string };

export interface MdListItem {
  inlines: MdInline[];
  checked: boolean | null;
}

export type MdTableAlign = 'left' | 'center' | 'right' | null;

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inlines: MdInline[] }
  | { kind: 'list'; ordered: boolean; items: MdListItem[] }
  | { kind: 'paragraph'; inlines: MdInline[] }
  | { kind: 'blockquote'; blocks: MdBlock[] }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'hr' }
  | {
      kind: 'table';
      align: MdTableAlign[];
      headers: MdInline[][];
      rows: MdInline[][][];
    };

const HEADING_PATTERN = /^(#{1,6})\s+(.*)$/;
const UNORDERED_PATTERN = /^[-*+]\s+(.*)$/;
const ORDERED_PATTERN = /^\d{1,3}[.)]\s+(.*)$/;
const CHECKBOX_PATTERN = /^\[([ xX])]\s+(.*)$/;
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HR_PATTERN = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_PATTERN = /^\s*>\s?(.*)$/;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
const INLINE_PATTERN =
  /(!\[([^\]\n]*)]\(([^)\s]+)\))|(\[([^\]\n]*)]\(([^)\s]+)\))|(\*\*([^*\n]+)\*\*)|(\*([^*\n]+)\*)|(`([^`\n]+)`)/g;

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
      tokens.push({ kind: 'image', value: match[2], url: match[3] ?? '' });
    } else if (match[5] !== undefined) {
      const url = match[6] ?? '';
      flushPlain();
      tokens.push({ kind: 'link', value: match[5] === '' ? url : match[5], url });
    } else if (match[8] !== undefined) {
      flushPlain();
      tokens.push({ kind: 'strong', value: match[8] });
    } else if (match[10] !== undefined) {
      flushPlain();
      tokens.push({ kind: 'em', value: match[10] });
    } else if (match[12] !== undefined) {
      flushPlain();
      tokens.push({ kind: 'code', value: match[12] });
    }
  }

  if (cursor < line.length) {
    plain += line.slice(cursor);
  }
  flushPlain();
  return tokens;
}

/** Разбирает документ в блоки: заголовки, списки, таблицы, код и цитаты. */
export function parseMarkdown(text: string): MdBlock[] {
  const lines = text.split('\n');
  const blocks: MdBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = FENCE_PATTERN.exec(line);
    if (fence) {
      const marker = fence[1] ?? '```';
      const language = fence[2] ?? '';
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith(marker)) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ kind: 'code', language, code: code.join('\n') });
      continue;
    }

    const heading = HEADING_PATTERN.exec(line);
    if (heading) {
      const level = (heading[1] ?? '').length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ kind: 'heading', level, inlines: parseInline(heading[2] ?? '') });
      index += 1;
      continue;
    }

    if (HR_PATTERN.test(line)) {
      blocks.push({ kind: 'hr' });
      index += 1;
      continue;
    }

    if (QUOTE_PATTERN.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = QUOTE_PATTERN.exec(lines[index] ?? '');
        if (!quote) {
          break;
        }
        quoteLines.push(quote[1] ?? '');
        index += 1;
      }
      blocks.push({ kind: 'blockquote', blocks: parseMarkdown(quoteLines.join('\n')) });
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      blocks.push(table.block);
      index = table.next;
      continue;
    }

    const unordered = UNORDERED_PATTERN.exec(line);
    const ordered = ORDERED_PATTERN.exec(line);
    if (unordered || ordered) {
      const orderedList = Boolean(ordered);
      const items: MdListItem[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? '';
        const match = orderedList ? ORDERED_PATTERN.exec(current) : UNORDERED_PATTERN.exec(current);
        if (!match) {
          break;
        }
        const raw = match[1] ?? '';
        const checkbox = CHECKBOX_PATTERN.exec(raw);
        items.push({
          inlines: parseInline(checkbox ? (checkbox[2] ?? '') : raw),
          checked: checkbox ? (checkbox[1] ?? '').toLowerCase() === 'x' : null,
        });
        index += 1;
      }
      blocks.push({ kind: 'list', ordered: orderedList, items });
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index] ?? '';
      if (next.trim() === '' || startsBlock(lines, index)) {
        break;
      }
      paragraph.push(next);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
  }

  return blocks;
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? '';
  return (
    FENCE_PATTERN.test(line) ||
    HEADING_PATTERN.test(line) ||
    HR_PATTERN.test(line) ||
    QUOTE_PATTERN.test(line) ||
    UNORDERED_PATTERN.test(line) ||
    ORDERED_PATTERN.test(line) ||
    isTableStart(lines, index)
  );
}

function parseTable(
  lines: string[],
  index: number,
): { block: Extract<MdBlock, { kind: 'table' }>; next: number } | null {
  if (!isTableStart(lines, index)) {
    return null;
  }
  const headers = splitTableRow(lines[index] ?? '');
  const separator = splitTableRow(lines[index + 1] ?? '');
  const align = separator.map<MdTableAlign>((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) {
      return 'center';
    }
    if (left) {
      return 'left';
    }
    if (right) {
      return 'right';
    }
    return null;
  });
  const rows: MdInline[][][] = [];
  let next = index + 2;
  while (next < lines.length && (lines[next] ?? '').includes('|')) {
    const cells = splitTableRow(lines[next] ?? '');
    if (cells.every((cell) => cell.trim() === '')) {
      break;
    }
    rows.push(cells.map(parseInline));
    next += 1;
  }
  return {
    block: {
      kind: 'table',
      align,
      headers: headers.map(parseInline),
      rows,
    },
    next,
  };
}

function isTableStart(lines: string[], index: number): boolean {
  const header = lines[index] ?? '';
  const separator = lines[index + 1] ?? '';
  if (!header.includes('|') || !separator.includes('|')) {
    return false;
  }
  const headerCells = splitTableRow(header);
  const separatorCells = splitTableRow(separator);
  return (
    headerCells.length > 0 &&
    headerCells.length === separatorCells.length &&
    separatorCells.every((cell) => TABLE_SEPARATOR_CELL.test(cell.trim()))
  );
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith('|')) {
    value = value.slice(1);
  }
  if (value.endsWith('|')) {
    value = value.slice(0, -1);
  }
  return value.split('|').map((cell) => cell.trim());
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
