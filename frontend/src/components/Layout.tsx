import { Link, Outlet, useLocation } from 'react-router-dom';

import { useBackendHealth } from '../hooks/useBackendHealth';
import { FRONTEND_MODULES } from '../modules/registry';
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

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.54 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.54a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.46 9v.09A1.7 1.7 0 0 0 21 10h.09a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
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
  if (pathname === '/settings') {
    return 'Настройки';
  }
  if (pathname.startsWith('/modules/')) {
    const name = pathname.split('/')[2] ?? '';
    return FRONTEND_MODULES.find((module) => module.name === name)?.title ?? 'Модуль';
  }
  return 'Страница';
}

export function Layout() {
  const { pathname } = useLocation();
  const diagramsActive = pathname === '/' || (pathname.startsWith('/d/') && pathname !== '/d/new');
  const newDiagramActive = pathname === '/d/new';
  const settingsActive = pathname === '/settings';
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
            className={`app-rail__link${newDiagramActive ? ' is-active' : ''}`}
            to="/d/new"
            aria-current={newDiagramActive ? 'page' : undefined}
          >
            <span className="app-rail__icon">
              <PlusIcon />
            </span>
            <span className="app-rail__label">Новая</span>
          </Link>
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
          {FRONTEND_MODULES.map((module) => {
            const active = pathname === module.path;
            return (
              <Link
                key={module.name}
                className={`app-rail__link${active ? ' is-active' : ''}`}
                to={module.path}
                aria-current={active ? 'page' : undefined}
              >
                <span className="app-rail__icon" aria-hidden="true">
                  ◫
                </span>
                <span className="app-rail__label">{module.title}</span>
              </Link>
            );
          })}
          <Link
            className={`app-rail__link${settingsActive ? ' is-active' : ''}`}
            to="/settings"
            aria-current={settingsActive ? 'page' : undefined}
          >
            <span className="app-rail__icon">
              <SettingsIcon />
            </span>
            <span className="app-rail__label">Настройки</span>
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
