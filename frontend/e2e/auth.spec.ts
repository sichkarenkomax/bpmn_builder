import { expect, test } from '@playwright/test';

/** 4.1: без сессии показывается вход, после регистрации открывается приложение. */

test.describe('вход и регистрация', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('аноним видит вход, регистрируется и выходит', async ({ page }) => {
    const email = `new-${Date.now()}@bpmn.local`;

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'BPMN Studio' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Войти' })).toHaveAttribute('aria-selected', 'true');

    // Защищённые данные без сессии не запрашиваются — API вернул бы 401.
    await expect(page.getByRole('heading', { name: 'Диаграммы' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Регистрация' }).click();
    await page.getByLabel('Имя').fill('Новый пользователь');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill('password-123');
    await page.getByRole('button', { name: 'Зарегистрироваться' }).click();

    await expect(page.getByRole('heading', { name: 'Диаграммы' })).toBeVisible();
    await expect(page.locator('.app-user__name')).toHaveText('Новый пользователь');

    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page.getByRole('tab', { name: 'Войти' })).toBeVisible();

    // Повторный вход тем же паролем.
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Пароль').fill('password-123');
    await page.locator('.auth-form').getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('heading', { name: 'Диаграммы' })).toBeVisible();
  });

  test('неверный пароль показывает ошибку', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill('e2e@bpmn.local');
    await page.getByLabel('Пароль').fill('неверный-пароль');
    await page.locator('.auth-form').getByRole('button', { name: 'Войти' }).click();
    await expect(page.getByRole('alert')).toContainText('Неверный email или пароль');
  });
});
