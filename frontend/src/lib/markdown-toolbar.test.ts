import { describe, expect, it } from 'vitest';

import { applyFormat, type FormatResult } from './markdown-toolbar';

function apply(
  kind: Parameters<typeof applyFormat>[0],
  value: string,
  start: number,
  end: number,
): FormatResult {
  return applyFormat(kind, value, start, end);
}

describe('applyFormat', () => {
  it('оборачивает выделение в жирный', () => {
    const result = apply('bold', 'до выделение после', 3, 12);
    expect(result.value).toBe('до **выделение** после');
    expect(result).toMatchObject({ start: 5, end: 14 });
  });

  it('повторный жирный снимает обёртку', () => {
    const once = apply('bold', 'текст', 0, 5);
    const twice = apply('bold', once.value, once.start, once.end);
    expect(twice.value).toBe('текст');
    expect(twice).toMatchObject({ start: 0, end: 5 });
  });

  it('пустое выделение вставляет плейсхолдер и выделяет его', () => {
    const result = apply('italic', 'a', 1, 1);
    expect(result.value).toBe('a*текст*');
    expect(result).toMatchObject({ start: 2, end: 7 });
  });

  it('код оборачивает выделение в обратные кавычки', () => {
    expect(apply('code', 'x', 0, 1).value).toBe('`x`');
  });

  it('заголовок ставится в начале каждой выделенной строки и снимается повтором', () => {
    const once = apply('heading', 'первая\nвторая', 3, 9);
    expect(once.value).toBe('## первая\n## вторая');
    const twice = apply('heading', once.value, once.start, once.end);
    expect(twice.value).toBe('первая\nвторая');
  });

  it('маркированный список префиксует каждую выделенную строку', () => {
    const result = apply('bulletList', 'шаг один\nшаг два', 0, 17);
    expect(result.value).toBe('- шаг один\n- шаг два');
  });

  it('повтор маркированного списка убирает префиксы', () => {
    const once = apply('bulletList', 'шаг один\nшаг два', 0, 17);
    const twice = apply('bulletList', once.value, once.start, once.end);
    expect(twice.value).toBe('шаг один\nшаг два');
  });

  it('нумерованный список продолжается по порядку', () => {
    const result = apply('orderedList', 'первый\nвторой', 0, 12);
    expect(result.value).toBe('1. первый\n2. второй');
  });

  it('нумерованный список не трогает пустые строки', () => {
    const result = apply('orderedList', 'первый\n\nвторой', 0, 13);
    expect(result.value).toBe('1. первый\n\n2. второй');
  });

  it('выделенный текст превращается в ссылку с выделенным адресом', () => {
    const result = apply('link', 'смотри спецификацию', 0, 19);
    expect(result.value).toBe('[смотри спецификацию](url)');
    expect(result).toMatchObject({ start: 22, end: 25 });
  });

  it('пустое выделение вставляет шаблон ссылки', () => {
    const result = apply('link', '', 0, 0);
    expect(result.value).toBe('[текст](url)');
    expect(result).toMatchObject({ start: 1, end: 6 });
  });

  it('префикс ставится только на выделенные строки, предыдущие не затрагиваются', () => {
    const result = apply('bulletList', 'антоним\nвыделенная строка', 8, 25);
    expect(result.value).toBe('антоним\n- выделенная строка');
  });
});
