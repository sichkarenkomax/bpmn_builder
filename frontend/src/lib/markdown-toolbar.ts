// Форматирование Markdown в textarea документации (задача 1.3.12).
// Чистые функции: получают значение и границы выделения, возвращают новое
// значение и выделение, которое нужно восстановить после обновления value.

export type FormatKind =
  'bold' | 'italic' | 'code' | 'heading' | 'bulletList' | 'orderedList' | 'link';

export interface TextSelection {
  start: number;
  end: number;
}

export interface FormatResult extends TextSelection {
  value: string;
}

/** Обёртка инлайн-разметки вокруг выделения; повторное применение снимает её. */
function wrapInline(
  value: string,
  start: number,
  end: number,
  token: string,
  placeholder: string,
): FormatResult {
  const before = value.slice(0, start);
  const after = value.slice(end);

  // Снятие: токен стоит ровно перед и после выделения («**|текст|**»).
  if (
    start >= token.length &&
    value.slice(start - token.length, start) === token &&
    value.slice(end, end + token.length) === token
  ) {
    return {
      value: `${value.slice(0, start - token.length)}${value.slice(start, end)}${value.slice(end + token.length)}`,
      start: start - token.length,
      end: end - token.length,
    };
  }

  // Снятие: само выделение уже обёрнуто в токен.
  const selected = value.slice(start, end);
  if (
    selected.startsWith(token) &&
    selected.endsWith(token) &&
    selected.length >= token.length * 2
  ) {
    const inner = selected.slice(token.length, -token.length);
    return {
      value: `${before}${inner}${after}`,
      start,
      end: start + inner.length,
    };
  }

  // Обёртывание: пустое выделение превращаем в плейсхолдер, чтобы было видно результат.
  const inner = selected === '' ? placeholder : selected;
  return {
    value: `${before}${token}${inner}${token}${after}`,
    start: start + token.length,
    end: start + token.length + inner.length,
  };
}

interface LinePrefix {
  pattern: RegExp;
  build: (index: number) => string;
}

/**
 * Префикс строк выделения. Повторное применение снимает префикс; строки,
 * у которых префикс уже стоит, при добавлении не задваиваются.
 */
function prefixLines(value: string, start: number, end: number, prefix: LinePrefix): FormatResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const newlineAfter = value.slice(end).indexOf('\n');
  // Выделение заканчивается внутри строки — доформатируем строку до конца.
  const spanEnd = newlineAfter === -1 ? value.length : end + newlineAfter;
  const block = value.slice(lineStart, spanEnd);
  const lines = block.split('\n');

  const allPrefixed = lines.every((line) => line.trim() === '' || prefix.pattern.test(line));
  let number = 0;
  const next = lines
    .map((line) => {
      if (line.trim() === '') {
        return line;
      }
      if (allPrefixed) {
        return line.replace(prefix.pattern, '');
      }
      if (prefix.pattern.test(line)) {
        return line;
      }
      return `${prefix.build(number++)}${line}`;
    })
    .join('\n');

  return {
    value: `${value.slice(0, lineStart)}${next}${value.slice(spanEnd)}`,
    start: lineStart,
    end: lineStart + next.length,
  };
}

export function applyFormat(
  kind: FormatKind,
  value: string,
  start: number,
  end: number,
): FormatResult {
  switch (kind) {
    case 'bold':
      return wrapInline(value, start, end, '**', 'текст');
    case 'italic':
      return wrapInline(value, start, end, '*', 'текст');
    case 'code':
      return wrapInline(value, start, end, '`', 'код');
    case 'heading':
      return prefixLines(value, start, end, {
        pattern: /^##+\s+/,
        build: () => '## ',
      });
    case 'bulletList':
      return prefixLines(value, start, end, {
        pattern: /^[-*+]\s+/,
        build: () => '- ',
      });
    case 'orderedList':
      return prefixLines(value, start, end, {
        pattern: /^\d{1,3}[.)]\s+/,
        build: (index) => `${index + 1}. `,
      });
    case 'link': {
      const selected = value.slice(start, end);
      if (selected === '') {
        const inserted = '[текст](url)';
        return {
          value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
          start: start + 1,
          end: start + 6,
        };
      }
      const inserted = `[${selected}](url)`;
      const urlStart = start + selected.length + 3;
      return {
        value: `${value.slice(0, start)}${inserted}${value.slice(end)}`,
        start: urlStart,
        end: urlStart + 3,
      };
    }
  }
}
