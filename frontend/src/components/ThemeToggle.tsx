import { useState } from 'react';

import { applyTheme, nextTheme, saveTheme, type Theme } from '../lib/theme';

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  const toggle = () => {
    const updated = nextTheme(theme);
    setTheme(updated);
    applyTheme(updated, document.documentElement);
    saveTheme(updated);
  };

  return (
    <button
      type="button"
      className="ghost-button"
      onClick={toggle}
      aria-label="Переключить тему"
      title="Переключить тему"
    >
      {theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
    </button>
  );
}
