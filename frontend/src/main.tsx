import './styles/tokens.css';
import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './App';
import { ToastProvider } from './components/ToastProvider';
import { applyTheme, loadTheme } from './lib/theme';

applyTheme(loadTheme(), document.documentElement);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Не найден контейнер #root');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
