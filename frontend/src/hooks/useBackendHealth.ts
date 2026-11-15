import { useEffect, useState } from 'react';

import { fetchHealth } from '../lib/api';

export type BackendState =
  | { status: 'checking' }
  | { status: 'online'; version: string }
  | { status: 'offline'; reason: string };

export function useBackendHealth(): BackendState {
  const [state, setState] = useState<BackendState>({ status: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth(controller.signal)
      .then((health) => setState({ status: 'online', version: health.version }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          status: 'offline',
          reason: error instanceof Error ? error.message : 'неизвестная ошибка',
        });
      });

    return () => controller.abort();
  }, []);

  return state;
}
