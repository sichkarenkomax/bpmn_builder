import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearLocalDraft, readLocalDraft, writeLocalDraft } from './draft-store';

describe('draft-store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('indexedDB', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('сохраняет и читает черновик через localStorage, если IndexedDB нет', async () => {
    const outcome = await writeLocalDraft('d1', {
      xml: '<bpmn:definitions/>',
      savedAt: 123,
      etag: 'abc',
    });

    expect(outcome).toBe('localstorage');
    expect(await readLocalDraft('d1')).toEqual({
      xml: '<bpmn:definitions/>',
      savedAt: 123,
      etag: 'abc',
    });
  });

  it('удаляет черновик', async () => {
    await writeLocalDraft('d1', { xml: '<x/>', savedAt: 1, etag: null });
    await clearLocalDraft('d1');

    expect(await readLocalDraft('d1')).toBeNull();
  });

  it('игнорирует повреждённый черновик', async () => {
    window.localStorage.setItem('bpmn-studio.draft.d1', '{broken');

    expect(await readLocalDraft('d1')).toBeNull();
  });
});
