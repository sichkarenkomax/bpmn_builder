import { describe, expect, it } from 'vitest';

import { isSafeUrl, parseInline, parseMarkdown } from './markdown';

describe('parseMarkdown', () => {
  it('разбирает заголовки, абзацы и списки', () => {
    const blocks = parseMarkdown('# Порядок\n\nТекст шага\n\n- первый\n- второй\n\n3. третий');
    expect(blocks).toEqual([
      { kind: 'heading', level: 1, inlines: [{ kind: 'text', value: 'Порядок' }] },
      { kind: 'paragraph', inlines: [{ kind: 'text', value: 'Текст шага' }] },
      {
        kind: 'list',
        ordered: false,
        items: [
          { inlines: [{ kind: 'text', value: 'первый' }], checked: null },
          { inlines: [{ kind: 'text', value: 'второй' }], checked: null },
        ],
      },
      {
        kind: 'list',
        ordered: true,
        items: [{ inlines: [{ kind: 'text', value: 'третий' }], checked: null }],
      },
    ]);
  });

  it('многострочный абзац остаётся одним блоком, пустые строки его завершают', () => {
    const blocks = parseMarkdown('первая строка\nвторая строка\n\nследующий абзац');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      inlines: [{ kind: 'text', value: 'первая строка\nвторая строка' }],
    });
  });

  it('поддерживает шесть уровней заголовков', () => {
    const blocks = parseMarkdown('#### четвёртый\n##### пятый\n###### шестой');
    expect(blocks).toEqual([
      { kind: 'heading', level: 4, inlines: [{ kind: 'text', value: 'четвёртый' }] },
      { kind: 'heading', level: 5, inlines: [{ kind: 'text', value: 'пятый' }] },
      { kind: 'heading', level: 6, inlines: [{ kind: 'text', value: 'шестой' }] },
    ]);
  });

  it('разбирает чек-лист и обычный список отдельно', () => {
    const blocks = parseMarkdown('- [ ] сделать\n- [x] готово\n\n- обычный');
    expect(blocks[0]).toEqual({
      kind: 'list',
      ordered: false,
      items: [
        { inlines: [{ kind: 'text', value: 'сделать' }], checked: false },
        { inlines: [{ kind: 'text', value: 'готово' }], checked: true },
      ],
    });
    expect(blocks[1]).toMatchObject({ kind: 'list', ordered: false });
  });

  it('разбирает цитату, линию и блок кода', () => {
    const blocks = parseMarkdown('> важно\n> ещё\n\n---\n\n```ts\nconst x = 1;\n```');
    expect(blocks[0]).toMatchObject({ kind: 'blockquote' });
    expect(blocks[1]).toEqual({ kind: 'hr' });
    expect(blocks[2]).toEqual({ kind: 'code', language: 'ts', code: 'const x = 1;' });
  });

  it('разбирает таблицу с выравниванием колонок', () => {
    const blocks = parseMarkdown('| Имя | Статус |\n| :--- | ---: |\n| Заявка | **готово** |');
    expect(blocks).toEqual([
      {
        kind: 'table',
        align: ['left', 'right'],
        headers: [[{ kind: 'text', value: 'Имя' }], [{ kind: 'text', value: 'Статус' }]],
        rows: [[[{ kind: 'text', value: 'Заявка' }], [{ kind: 'strong', value: 'готово' }]]],
      },
    ]);
  });

  it('пустой и неопределённый текст дают пустой документ', () => {
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('   \n\n  ')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('разбирает жирный, курсив, код и ссылку в одной строке', () => {
    const tokens = parseInline(
      'жирный **важно**, курсив *акцент*, код `x=1`, ссылка [docs](https://example.com)',
    );
    expect(tokens).toEqual([
      { kind: 'text', value: 'жирный ' },
      { kind: 'strong', value: 'важно' },
      { kind: 'text', value: ', курсив ' },
      { kind: 'em', value: 'акцент' },
      { kind: 'text', value: ', код ' },
      { kind: 'code', value: 'x=1' },
      { kind: 'text', value: ', ссылка ' },
      { kind: 'link', value: 'docs', url: 'https://example.com' },
    ]);
  });

  it('разбирает изображение отдельно от ссылки', () => {
    expect(parseInline('![схема](https://example.com/a.png)')).toEqual([
      { kind: 'image', value: 'схема', url: 'https://example.com/a.png' },
    ]);
  });

  it('незакрытая разметка остаётся обычным текстом', () => {
    expect(parseInline('что-то **важное')).toEqual([{ kind: 'text', value: 'что-то **важное' }]);
  });

  it('ссылка без текста использует адрес как подпись', () => {
    expect(parseInline('[](https://example.com)')).toEqual([
      { kind: 'link', value: 'https://example.com', url: 'https://example.com' },
    ]);
  });
});

describe('isSafeUrl', () => {
  it('пускает http(s), mailto и относительные адреса', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://localhost:8000/docs')).toBe(true);
    expect(isSafeUrl('mailto:ops@example.com')).toBe(true);
    expect(isSafeUrl('/api/v1/diagrams')).toBe(true);
    expect(isSafeUrl('./note.md')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
  });

  it('блокирует javascript: и прочие схемы', () => {
    expect(isSafeUrl("javascript:alert('x')")).toBe(false);
    expect(isSafeUrl('data:text/html;base64,AAAA')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
  });
});
