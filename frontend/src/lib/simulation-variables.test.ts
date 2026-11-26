import { describe, expect, it } from 'vitest';

import { parseSimulationVariables } from './simulation-variables';

describe('parseSimulationVariables', () => {
  it('разбирает типы: число, boolean, строку и голый текст', () => {
    expect(
      parseSimulationVariables(
        ['amount = 1200', 'ratio = 0.5', 'approved = true', "name = 'Иван'", 'note = готово'].join(
          '\n',
        ),
      ),
    ).toEqual({
      variables: { amount: 1200, ratio: 0.5, approved: true, name: 'Иван', note: 'готово' },
      error: null,
    });
  });

  it('пропускает пустые строки и комментарии', () => {
    expect(parseSimulationVariables('\n# комментарий\nok = false\n\n')).toEqual({
      variables: { ok: false },
      error: null,
    });
  });

  it('сообщает номер строки при ошибке', () => {
    expect(parseSimulationVariables('ok = true\nбез равно')).toEqual({
      variables: { ok: true },
      error: 'Строка 2: ожидается «имя = значение»',
    });
    expect(parseSimulationVariables('ok = true\n1bad = 2')).toEqual({
      variables: { ok: true },
      error: 'Строка 2: имя «1bad» должно быть латиницей, цифрами и «_»',
    });
    expect(parseSimulationVariables('ok =')).toEqual({
      variables: {},
      error: 'Строка 1: у переменной «ok» нет значения',
    });
  });
});
