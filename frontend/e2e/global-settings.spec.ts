import { expect, test, type APIRequestContext } from '@playwright/test';

const API = '/api/v1';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="D" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false"><bpmn:task id="Task_1" name="Задача" /></bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1"><dc:Bounds x="200" y="200" width="100" height="80" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

async function createDiagram(request: APIRequestContext) {
  const created = await request.post(`${API}/diagrams`, {
    data: { title: `E2E settings ${Date.now()}`, bpmn_xml: xml },
  });
  expect(created.ok()).toBeTruthy();
  return (await created.json()) as { id: string };
}

test('глобальные настройки в рельсе задают значения по умолчанию', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Настройки' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await expect(page.locator('.app-topbar__current')).toHaveText('Настройки');

  const autosave = page.getByLabel('Период сохранения на сервер, секунд');
  await expect(autosave).toHaveValue('180');
  await autosave.fill('45');
  await autosave.press('Enter');
  await expect(page.locator('.settings-saved')).toHaveText('Сохранено');

  await expect(page.getByLabel('Когда проверять')).toHaveValue('manual');
  await page.getByLabel('Markdown-панель в документации элемента').uncheck();
  await page.getByLabel('Левая кнопка на пустом холсте').selectOption('pan');

  // Горячие клавиши настраиваются только здесь.
  await expect(page.getByRole('button', { name: 'Изменить' }).first()).toBeVisible();

  const diagram = await createDiagram(request);
  try {
    await page.goto(`/d/${diagram.id}`);
    await page.getByRole('button', { name: 'Настройки редактора' }).click();
    const settings = page.getByRole('dialog', { name: 'Настройки' });
    await expect(settings).toBeVisible();

    // Схема без переопределений видит глобальные значения.
    await expect(settings.getByLabel('Период сохранения на сервер, секунд')).toHaveValue('45');
    await expect(settings.getByLabel('Markdown-панель в документации элемента')).not.toBeChecked();
    await expect(settings.getByLabel('Левая кнопка на пустом холсте')).toHaveValue('pan');
    await expect(settings.getByRole('button', { name: 'Изменить' })).toHaveCount(0);

    // Иконка настроек — шестерёнка, а не клавиатура.
    const settingsButton = page.getByRole('button', { name: 'Настройки редактора' });
    await expect(settingsButton.locator('svg')).toBeVisible();

    // Переопределение живёт только в этой схеме.
    const schemaAutosave = settings.getByLabel('Период сохранения на сервер, секунд');
    await schemaAutosave.fill('30');
    await schemaAutosave.press('Enter');
    await settings.getByRole('button', { name: 'Готово' }).click();

    await page.reload();
    await page.getByRole('button', { name: 'Настройки редактора' }).click();
    await expect(
      page
        .getByRole('dialog', { name: 'Настройки' })
        .getByLabel('Период сохранения на сервер, секунд'),
    ).toHaveValue('30');

    await page
      .getByRole('dialog', { name: 'Настройки' })
      .getByRole('button', { name: 'Сбросить для схемы' })
      .click();
    await expect(
      page
        .getByRole('dialog', { name: 'Настройки' })
        .getByLabel('Период сохранения на сервер, секунд'),
    ).toHaveValue('45');

    await page.goto('/settings');
    await expect(page.getByLabel('Период сохранения на сервер, секунд')).toHaveValue('45');
  } finally {
    await request.delete(`${API}/diagrams/${diagram.id}`);
  }
});
