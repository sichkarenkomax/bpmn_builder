/** Комментарии-аннотации (1.3.8): группировка по элементам и подписи автора. */

import type { DiagramComment } from './api';

export const COMMENT_OVERLAY_TYPE = 'bs-comment';

/** До этапа 4 учётных записей нет — сервер пишет автора `local`. */
export function commentAuthorLabel(authorId: string | null): string {
  if (!authorId || authorId === 'local') {
    return 'Вы';
  }
  return authorId;
}

/** Открытые (не решённые) обсуждения по id элемента — для маркеров на холсте. */
export function groupOpenComments(comments: DiagramComment[]): Map<string, DiagramComment[]> {
  const threads = new Map<string, DiagramComment[]>();
  for (const comment of comments) {
    if (!comment.element_id || comment.resolved_at) {
      continue;
    }
    const thread = threads.get(comment.element_id);
    if (thread) {
      thread.push(comment);
    } else {
      threads.set(comment.element_id, [comment]);
    }
  }
  return threads;
}

export function commentsForElement(
  comments: DiagramComment[],
  elementId: string | null,
): DiagramComment[] {
  if (!elementId) {
    return [];
  }
  return comments.filter((comment) => comment.element_id === elementId);
}

export function openCommentCount(comments: DiagramComment[]): number {
  return comments.filter((comment) => comment.element_id && !comment.resolved_at).length;
}

/** Компактное время сообщения: сегодня — часы, иначе дата. */
export function formatCommentTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  return sameDay
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
