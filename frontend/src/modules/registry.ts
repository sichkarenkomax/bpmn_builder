import type { ComponentType } from 'react';

/**
 * Frontend-модуль (4.0.5, ADR-006): своя страница в `src/modules/<name>/`,
 * ленивая загрузка и общий API-клиент. Модуль не импортирует редактор.
 */
export type FrontendModule = {
  name: string;
  title: string;
  path: string;
  /** Динамический импорт: код модуля уходит в отдельный чанк. */
  load: () => Promise<{ default: ComponentType }>;
};

export const FRONTEND_MODULES: FrontendModule[] = [
  {
    name: 'pilot',
    title: 'Пилотный модуль',
    path: '/modules/pilot',
    load: () => import('./pilot/PilotPage').then((module) => ({ default: module.PilotPage })),
  },
];

export function moduleByName(name: string): FrontendModule | undefined {
  return FRONTEND_MODULES.find((module) => module.name === name);
}
