import { Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { DiagramListPage } from './pages/DiagramListPage';
import { DiagramPage } from './pages/DiagramPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DiagramListPage />} />
        <Route path="/d/:diagramId" element={<DiagramPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
