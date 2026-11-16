import type { Page } from '@playwright/test';

/** Открыть единое меню действий тулбара (1.3.22). */
export async function openActions(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Действия' }).click();
}
