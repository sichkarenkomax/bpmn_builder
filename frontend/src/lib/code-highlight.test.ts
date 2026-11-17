import { describe, expect, it } from 'vitest';

import { highlightCode } from './code-highlight';

describe('highlightCode', () => {
  it('подсвечивает ключевые слова, строки, числа и комментарии TypeScript', () => {
    const tokens = highlightCode('const x = "ok"; // коммент\nreturn 42;', 'ts');
    expect(tokens).toEqual([
      { kind: 'keyword', text: 'const' },
      { kind: 'plain', text: ' x = ' },
      { kind: 'string', text: '"ok"' },
      { kind: 'plain', text: '; ' },
      { kind: 'comment', text: '// коммент' },
      { kind: 'plain', text: '\n' },
      { kind: 'keyword', text: 'return' },
      { kind: 'plain', text: ' ' },
      { kind: 'number', text: '42' },
      { kind: 'plain', text: ';' },
    ]);
  });

  it('различает теги, атрибуты и строки XML', () => {
    const tokens = highlightCode('<bpmn:task id="Task_1" />', 'xml');
    expect(tokens.some((token) => token.kind === 'tag' && token.text === '<bpmn:task')).toBe(true);
    expect(tokens.some((token) => token.kind === 'attr' && token.text === 'id')).toBe(true);
    expect(tokens.some((token) => token.kind === 'string' && token.text === '"Task_1"')).toBe(true);
  });

  it('неизвестный язык оставляет код без подсветки', () => {
    expect(highlightCode('любой текст', 'unknown')).toEqual([
      { kind: 'plain', text: 'любой текст' },
    ]);
  });
});
