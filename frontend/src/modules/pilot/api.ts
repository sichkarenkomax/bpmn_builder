import { apiRequest, apiRequestNoContent } from '../../lib/api';

export type PilotNote = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
};

const PATH = '/pilot/notes';

export function listNotes(signal?: AbortSignal): Promise<PilotNote[]> {
  return apiRequest<PilotNote[]>(PATH, { signal });
}

export function createNote(title: string, body: string): Promise<PilotNote> {
  return apiRequest<PilotNote>(PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
}

export function deleteNote(id: string): Promise<void> {
  return apiRequestNoContent(`${PATH}/${id}`, { method: 'DELETE' });
}
