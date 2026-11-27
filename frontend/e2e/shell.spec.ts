import { expect, test } from '@playwright/test';

test('оболочка: навигация, хлебные крошки и активный пункт', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('link', { name: 'BPMN Studio — на главную' })).toBeVisible();
  await expect(page.locator('.app-topbar__current')).toHaveText('Диаграммы');
  await expect(page.getByRole('link', { name: 'Диаграммы' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.getByRole('link', { name: 'Новая' }).click();
  await expect(page).toHaveURL(/\/d\/new$/);
  await expect(page.locator('.app-topbar__current')).toHaveText('Новая диаграмма');
  await expect(page.getByRole('link', { name: 'Новая' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('link', { name: 'BPMN Studio — на главную' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.app-topbar__current')).toHaveText('Диаграммы');
});

test('оболочка: тема переключается и переживает перезагрузку', async ({ page }) => {
  await page.goto('/');

  const toggle = page.getByRole('button', { name: 'Включить тёмную тему' });
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Включить светлую тему' })).toBeVisible();

  await page.getByRole('button', { name: 'Включить светлую тему' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('оболочка: при прокрутке рельс и топбар остаются на месте', async ({ page, request }) => {
  const API = '/api/v1';
  const created: string[] = [];

  try {
    for (let index = 0; index < 6; index += 1) {
      const response = await request.post(`${API}/diagrams`, {
        data: { title: `E2E shell scroll ${Date.now()}-${index}` },
      });
      expect(response.ok()).toBeTruthy();
      const diagram = (await response.json()) as { id: string };
      created.push(diagram.id);
    }

    await page.setViewportSize({ width: 1440, height: 520 });
    await page.goto('/');

    const main = page.locator('.app-main');
    await expect.poll(() => main.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

    await page.mouse.move(720, 380);
    await page.mouse.wheel(0, 400);

    await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    const railTop = (await page.locator('.app-rail').boundingBox())!.y;
    const topbarTop = (await page.locator('.app-topbar').boundingBox())!.y;
    expect(railTop).toBe(0);
    expect(topbarTop).toBe(0);
  } finally {
    for (const id of created) {
      await request.delete(`${API}/diagrams/${id}`);
    }
  }
});

test('оболочка: на 1024 и 390 px нет горизонтальной прокрутки', async ({ page }) => {
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');

    await expect(page.locator('.app-rail')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Диаграммы' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
});
