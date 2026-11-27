import { Link, Outlet, useLocation } from 'react-router-dom';

import { useBackendHealth } from '../hooks/useBackendHealth';
import { loadTheme } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';

function DiagramsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="6" rx="2" />
      <rect x="3.5" y="13.5" width="10" height="6" rx="2" />
      <path d="M17.5 14v6M14.5 17h6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BackendBadge() {
  const state = useBackendHealth();

  if (state.status === 'checking') {
    return (
      <span className="app-status app-status--muted">
        <span className="app-status__dot" aria-hidden="true" />
        Проверяю API
      </span>
    );
  }
  if (state.status === 'online') {
    return (
      <span className="app-status app-status--ok" title={`API ${state.version}`}>
        <span className="app-status__dot" aria-hidden="true" />
        API {state.version}
      </span>
    );
  }
  return (
    <span className="app-status app-status--error" title={state.reason}>
      <span className="app-status__dot" aria-hidden="true" />
      API недоступен
    </span>
  );
}

function sectionName(pathname: string): string {
  if (pathname === '/d/new') {
    return 'Новая диаграмма';
  }
  if (pathname.startsWith('/d/')) {
    return 'Редактор диаграммы';
  }
  if (pathname === '/') {
    return 'Диаграммы';
  }
  return 'Страница';
}

export function Layout() {
  const { pathname } = useLocation();
  const diagramsActive = pathname === '/' || (pathname.startsWith('/d/') && pathname !== '/d/new');
  const newDiagramActive = pathname === '/d/new';
  // В редакторе рельс скрыт: холсту нужна вся доступная ширина.
  const editorFocus = pathname.startsWith('/d/') && pathname !== '/d/new';

  return (
    <div className={`app-shell${editorFocus ? ' app-shell--editor' : ''}`}>
      <aside className="app-rail" aria-label="Основная навигация">
        <Link className="app-rail__brand" to="/" aria-label="BPMN Studio — на главную">
          <span className="app-rail__mark" aria-hidden="true">
            ⌁
          </span>
        </Link>

        <nav className="app-rail__nav">
          <Link
            className={`app-rail__link${diagramsActive ? ' is-active' : ''}`}
            to="/"
            aria-current={diagramsActive ? 'page' : undefined}
          >
            <span className="app-rail__icon">
              <DiagramsIcon />
            </span>
            <span className="app-rail__label">Диаграммы</span>
          </Link>
          <Link
            className={`app-rail__link${newDiagramActive ? ' is-active' : ''}`}
            to="/d/new"
            aria-current={newDiagramActive ? 'page' : undefined}
          >
            <span className="app-rail__icon">
              <PlusIcon />
            </span>
            <span className="app-rail__label">Новая</span>
          </Link>
        </nav>

        <div className="app-rail__footer">
          <span className="app-rail__version" title="Версия приложения">
            v0.3
          </span>
        </div>
      </aside>

      <div className="app-frame">
        <header className="app-topbar">
          <nav className="app-topbar__crumbs" aria-label="Хлебные крошки">
            <Link className="app-topbar__root" to="/">
              BPMN Studio
            </Link>
            <span className="app-topbar__separator" aria-hidden="true">
              /
            </span>
            <span className="app-topbar__current" aria-current="page">
              {sectionName(pathname)}
            </span>
          </nav>
          <div className="app-topbar__actions">
            <BackendBadge />
            <ThemeToggle initial={loadTheme()} />
          </div>
        </header>

        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
