import { lazy, Suspense, useMemo } from 'react';
import { Route, Routes } from 'react-router-dom';

import { DialogFocusGuard } from './components/DialogFocusGuard';
import { Layout } from './components/Layout';
import { AuthGate } from './lib/auth-context';
import { FRONTEND_MODULES, type FrontendModule } from './modules/registry';
import { DiagramListPage } from './pages/DiagramListPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { SettingsPage } from './pages/SettingsPage';

// bpmn-js и редактор не должны попадать в начальный чанк списка диаграмм.
const DiagramPage = lazy(() =>
  import('./pages/DiagramPage').then((module) => ({ default: module.DiagramPage })),
);

function ModuleRoute({ module }: { module: FrontendModule }) {
  const Page = useMemo(() => lazy(module.load), [module]);
  return (
    <Suspense
      fallback={
        <section className="page page--centered">
          <p className="empty-state__text">Загружаю модуль…</p>
        </section>
      }
    >
      <Page />
    </Suspense>
  );
}

export function App() {
  return (
    <>
      <DialogFocusGuard />
      <AuthGate fallback={(onAuthenticated) => <LoginPage onAuthenticated={onAuthenticated} />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DiagramListPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {FRONTEND_MODULES.map((module) => (
              <Route
                key={module.name}
                path={module.path}
                element={<ModuleRoute module={module} />}
              />
            ))}
            <Route
              path="/d/:diagramId"
              element={
                <Suspense
                  fallback={
                    <section className="page page--centered">
                      <p className="empty-state__text">Загружаю редактор…</p>
                    </section>
                  }
                >
                  <DiagramPage />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>{' '}
        </Routes>
      </AuthGate>
    </>
  );
}
