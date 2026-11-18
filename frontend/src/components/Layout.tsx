import { Link, Outlet } from 'react-router-dom';

import { useBackendHealth } from '../hooks/useBackendHealth';
import { loadTheme } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

function BackendBadge() {
  const state = useBackendHealth();

  if (state.status === 'checking') {
    return <span className="badge badge--muted">проверяю API…</span>;
  }
  if (state.status === 'online') {
    return <span className="badge badge--ok">API {state.version}</span>;
  }
  return (
    <span className="badge badge--error" title={state.reason}>
      API недоступен
    </span>
  );
}

export function Layout() {
  return (
    <div className="shell">
      <header className="shell__header">
        <Link className="brand" to="/" aria-label="На главную">
          <span className="brand__mark" aria-hidden="true">
            ⌁
          </span>
          <span className="brand__name">BPMN Studio</span>
          <span className="brand__stage">v0.1 · экспорт</span>
        </Link>
        <div className="shell__header-actions">
          <BackendBadge />
          <ThemeToggle initial={loadTheme()} />
        </div>
      </header>

      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  );
}
