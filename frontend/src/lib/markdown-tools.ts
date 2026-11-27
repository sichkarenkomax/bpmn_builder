import type { FormatKind } from './markdown-toolbar';

/** Кнопки Markdown-панели: порядок и подписи общие для инспектора, окна и комментариев. */
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

/** Что остаётся в одной строке; остальное уезжает в меню «Ещё» (1.5.20). */
export const PRIMARY_MARKDOWN_KINDS: FormatKind[] = ['bold', 'italic', 'code', 'link'];

export const MARKDOWN_HELP =
  'Поддерживаются заголовки #–######, **жирный**, *курсив*, `код`, блоки ```, ' +
  'маркированные и нумерованные списки, чек-листы, цитаты, таблицы, линии ---, ' +
  '[ссылки](url) и ![картинки](url). Вложенные списки и HTML не поддерживаются.';
