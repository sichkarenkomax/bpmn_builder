import { useEffect, useState } from 'react';

import {
  ApiError,
  type DiagramList,
  type DiagramSummary,
  fetchDiagram,
  fetchDiagramXml,
  fetchDiagrams,
} from '../lib/api';

export type Loadable<T> =
  | { state: 'loading' }
  | { state: 'ready'; data: T }
  | { state: 'missing' }
  | { state: 'error'; message: string };

function useLoad<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Loadable<T> {
  const [result, setResult] = useState<Loadable<T>>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: 'loading' });

    loader(controller.signal)
      .then((data) => setResult({ state: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setResult({ state: 'missing' });
          return;
        }
        setResult({ state: 'error', message: error instanceof Error ? error.message : 'Ошибка' });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- загрузчик зависит только от deps
  }, deps);

  return result;
}

export function useDiagramList(): Loadable<DiagramList> {
  return useLoad((signal) => fetchDiagrams(signal), []);
}

export function useDiagram(id: string | null): Loadable<{ meta: DiagramSummary; xml: string }> {
  return useLoad(
    async (signal) => {
      if (id === null) {
        throw new Error('диаграмма не выбрана');
      }
      return {
        meta: await fetchDiagram(id, signal),
        xml: await fetchDiagramXml(id, signal),
      };
    },
    [id],
  );
}
