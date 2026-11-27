import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';

import { DialogFocusGuard } from './components/DialogFocusGuard';
import { Layout } from './components/Layout';
import { DiagramListPage } from './pages/DiagramListPage';
import { NotFoundPage } from './pages/NotFoundPage';

// bpmn-js и редактор не должны попадать в начальный чанк списка диаграмм.
const DiagramPage = lazy(() =>
  import('./pages/DiagramPage').then((module) => ({ default: module.DiagramPage })),
);

export function App() {
  return (
    <>
      <DialogFocusGuard />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DiagramListPage />} />
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
    </>
  );
}
