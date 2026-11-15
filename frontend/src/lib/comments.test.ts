import { describe, expect, it } from 'vitest';

import type { DiagramComment } from './api';
import {
  commentAuthorLabel,
  commentsForElement,
  formatCommentTime,
  groupOpenComments,
  openCommentCount,
} from './comments';

function comment(patch: Partial<DiagramComment>): DiagramComment {
  return {
    id: 'c1',
    diagram_id: 'd1',
    element_id: 'Task_1',
    body: 'текст',
    author_id: 'local',
    resolved_at: null,
    created_at: '2026-11-15T10:00:00Z',
    ...patch,
  };
}

describe('комментарии', () => {
  it('показывает локального автора как «Вы»', () => {
    expect(commentAuthorLabel('local')).toBe('Вы');
    expect(commentAuthorLabel(null)).toBe('Вы');
    expect(commentAuthorLabel('anna')).toBe('anna');
  });

  it('группирует только открытые обсуждения по элементам', () => {
    const threads = groupOpenComments([
      comment({ id: 'a', element_id: 'Task_1' }),
      comment({ id: 'b', element_id: 'Task_1' }),
      comment({ id: 'c', element_id: 'Task_1', resolved_at: '2026-11-15T11:00:00Z' }),
      comment({ id: 'd', element_id: 'Task_2' }),
      comment({ id: 'e', element_id: null }),
    ]);

    expect([...threads.keys()]).toEqual(['Task_1', 'Task_2']);
    expect(threads.get('Task_1')).toHaveLength(2);
    expect(threads.get('Task_2')).toHaveLength(1);
  });

  it('считает открытые комментарии и фильтрует ветку элемента', () => {
    const all = [
      comment({ id: 'a' }),
      comment({ id: 'b', resolved_at: '2026-11-15T11:00:00Z' }),
      comment({ id: 'c', element_id: 'Task_2' }),
      comment({ id: 'd', element_id: null }),
    ];

    expect(openCommentCount(all)).toBe(2);
    expect(commentsForElement(all, 'Task_1').map((item) => item.id)).toEqual(['a', 'b']);
    expect(commentsForElement(all, null)).toEqual([]);
  });

  it('форматирует время и терпит мусор', () => {
    const now = new Date('2026-11-15T12:00:00');
    expect(formatCommentTime('2026-11-15T10:30:00', now)).toMatch(/10:30/);
    expect(formatCommentTime('2026-11-01T10:30:00', now)).toMatch(/01\.11/);
    expect(formatCommentTime('не дата', now)).toBe('');
  });
});
