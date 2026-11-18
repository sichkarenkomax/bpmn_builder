/** Локальные черновики: IndexedDB вместо localStorage (квоты и большие XML). */

export interface LocalDraft {
  xml: string;
  savedAt: number;
  etag: string | null;
}

export type DraftWriteResult = 'indexeddb' | 'localstorage' | 'failed';

const DB_NAME = 'bpmn-studio';
const DB_VERSION = 1;
const STORE = 'drafts';
const LEGACY_PREFIX = 'bpmn-studio.draft.';

function legacyKey(diagramId: string): string {
  return `${LEGACY_PREFIX}${diagramId}`;
}

function validDraft(value: unknown): value is LocalDraft {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const draft = value as Partial<LocalDraft>;
  return typeof draft.xml === 'string' && typeof draft.savedAt === 'number';
}

function readLegacy(diagramId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(legacyKey(diagramId));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!validDraft(parsed)) {
      return null;
    }
    return { xml: parsed.xml, savedAt: parsed.savedAt, etag: parsed.etag ?? null };
  } catch {
    return null;
  }
}

function clearLegacy(diagramId: string): void {
  try {
    window.localStorage.removeItem(legacyKey(diagramId));
  } catch {
    // localStorage мог быть отключён приватным режимом — не критично.
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'diagramId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export async function readLocalDraft(diagramId: string): Promise<LocalDraft | null> {
  const db = await openDb();
  if (db) {
    try {
      const stored = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(diagramId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (validDraft(stored)) {
        return { xml: stored.xml, savedAt: stored.savedAt, etag: stored.etag ?? null };
      }
    } catch {
      // Падаем на localStorage: старые черновики должны остаться доступными.
    } finally {
      db.close();
    }
  }
  return readLegacy(diagramId);
}

export async function writeLocalDraft(
  diagramId: string,
  draft: LocalDraft,
): Promise<DraftWriteResult> {
  const db = await openDb();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put({ ...draft, diagramId });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      clearLegacy(diagramId);
      return 'indexeddb';
    } catch {
      // Ниже попробуем localStorage: небольшой черновик может уместиться там.
    } finally {
      db.close();
    }
  }

  try {
    window.localStorage.setItem(legacyKey(diagramId), JSON.stringify(draft));
    return 'localstorage';
  } catch {
    return 'failed';
  }
}

export async function clearLocalDraft(diagramId: string): Promise<void> {
  clearLegacy(diagramId);
  const db = await openDb();
  if (!db) {
    return;
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).delete(diagramId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    // Удаление — best effort: при следующем сохранении черновик перезапишется.
  } finally {
    db.close();
  }
}
