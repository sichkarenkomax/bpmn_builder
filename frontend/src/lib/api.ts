export interface HealthResponse {
  status: 'ok';
  service: string;
  version: string;
  environment: string;
}

export interface DiagramSummary {
  id: string;
  title: string;
  description: string | null;
  status: string;
  etag: string | null;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiagramList {
  items: DiagramSummary[];
  total: number;
}

export interface VersionSummary {
  id: string;
  diagram_id: string;
  message: string | null;
  author_id: string | null;
  created_at: string;
}

export const API_BASE: string =
  (import.meta.env['VITE_API_BASE'] as string | undefined) ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    throw new ApiError(response.status, `Запрос ${path} вернул ${response.status}`, detail);
  }
  return (await response.json()) as T;
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>('/health', { signal });
}

export function fetchDiagrams(signal?: AbortSignal): Promise<DiagramList> {
  return request<DiagramList>('/diagrams?limit=100', { signal });
}

export function fetchDiagram(id: string, signal?: AbortSignal): Promise<DiagramSummary> {
  return request<DiagramSummary>(`/diagrams/${id}`, { signal });
}

export async function fetchDiagramXml(id: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${API_BASE}/diagrams/${id}/bpmn`, { signal });
  if (!response.ok) {
    throw new ApiError(response.status, `Не удалось загрузить XML: ${response.status}`);
  }
  return response.text();
}

export function fetchVersions(id: string, signal?: AbortSignal): Promise<VersionSummary[]> {
  return request<VersionSummary[]>(`/diagrams/${id}/versions?limit=20`, { signal });
}

export async function saveDiagramXml(
  id: string,
  xml: string,
  etag: string | null,
  signal?: AbortSignal,
): Promise<{ etag: string; version_id: string }> {
  const response = await fetch(`${API_BASE}/diagrams/${id}/bpmn`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/xml',
      ...(etag ? { 'If-Match': `"${etag}"` } : {}),
    },
    body: xml,
    signal,
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    throw new ApiError(response.status, `Сохранение вернуло ${response.status}`, detail);
  }
  return (await response.json()) as { etag: string; version_id: string };
}

export type ServerExportFormat = 'json' | 'csv' | 'xlsx' | 'docx' | 'pdf';

export interface ExportJobSummary {
  id: string;
  diagram_id: string;
  format: ServerExportFormat;
  status: 'queued' | 'running' | 'done' | 'failed';
  progress: number;
  error: string | null;
  size: number;
  created_at: string;
  finished_at: string | null;
}

export function createExportJob(
  id: string,
  format: ServerExportFormat,
  xml: string,
  options: {
    pngBase64?: string;
    svg?: string;
    page?: 'A4' | 'A3';
    orientation?: 'portrait' | 'landscape';
  } = {},
): Promise<ExportJobSummary> {
  return request<ExportJobSummary>(`/diagrams/${id}/exports/${format}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      xml,
      png_base64: options.pngBase64 ?? null,
      svg: options.svg ?? null,
      page: options.page ?? 'A4',
      orientation: options.orientation ?? 'portrait',
    }),
  });
}

export function fetchExportJobs(id: string): Promise<ExportJobSummary[]> {
  return request<ExportJobSummary[]>(`/diagrams/${id}/exports/jobs`);
}

export function fetchExportJob(id: string, jobId: string): Promise<ExportJobSummary> {
  return request<ExportJobSummary>(`/diagrams/${id}/exports/jobs/${jobId}`);
}

export async function downloadExportJob(id: string, jobId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/diagrams/${id}/exports/jobs/${jobId}/download`);
  if (!response.ok) {
    throw new ApiError(response.status, `Скачивание вернуло ${response.status}`);
  }
  return response.blob();
}

export async function exportServerDocument(
  id: string,
  format: ServerExportFormat,
  xml: string,
  options: {
    pngBase64?: string;
    svg?: string;
    page?: 'A4' | 'A3';
    orientation?: 'portrait' | 'landscape';
  } = {},
): Promise<Blob> {
  const response = await fetch(`${API_BASE}/diagrams/${id}/exports/${format}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      xml,
      png_base64: options.pngBase64 ?? null,
      svg: options.svg ?? null,
      page: options.page ?? 'A4',
      orientation: options.orientation ?? 'portrait',
    }),
  });
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    throw new ApiError(response.status, `Экспорт вернул ${response.status}`, detail);
  }
  return response.blob();
}

export interface DiagramComment {
  id: string;
  diagram_id: string;
  element_id: string | null;
  body: string;
  author_id: string | null;
  resolved_at: string | null;
  created_at: string;
}

export function fetchComments(diagramId: string, signal?: AbortSignal): Promise<DiagramComment[]> {
  return request<DiagramComment[]>(`/diagrams/${diagramId}/comments`, { signal });
}

export function createComment(
  diagramId: string,
  elementId: string | null,
  body: string,
  signal?: AbortSignal,
): Promise<DiagramComment> {
  return request<DiagramComment>(`/diagrams/${diagramId}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ element_id: elementId, body }),
    signal,
  });
}

export function updateComment(
  diagramId: string,
  commentId: string,
  patch: { body?: string; resolved?: boolean },
  signal?: AbortSignal,
): Promise<DiagramComment> {
  return request<DiagramComment>(`/diagrams/${diagramId}/comments/${commentId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
    signal,
  });
}

export async function deleteComment(
  diagramId: string,
  commentId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE}/diagrams/${diagramId}/comments/${commentId}`, {
    method: 'DELETE',
    signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status, `Удаление комментария вернуло ${response.status}`);
  }
}

export function updateDiagram(
  id: string,
  patch: { title?: string; description?: string; status?: 'draft' | 'approved' | 'archived' },
): Promise<DiagramSummary> {
  return request<DiagramSummary>(`/diagrams/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function createDiagram(
  title: string,
  bpmnXml?: string,
  signal?: AbortSignal,
): Promise<DiagramSummary> {
  return request<DiagramSummary>('/diagrams', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, bpmn_xml: bpmnXml ?? null }),
    signal,
  });
}
