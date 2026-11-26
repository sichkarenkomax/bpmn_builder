/** Разбор переменных симуляции из текста «имя = значение» (этап 3). */

export interface ParsedVariables {
  variables: Record<string, boolean | number | string>;
  error: string | null;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER_RE = /^-?\d+(?:\.\d+)?$/;

function parseValue(raw: string): boolean | number | string {
  const text = raw.trim();
  if (/^(true|false)$/i.test(text)) {
    return text.toLowerCase() === 'true';
  }
  if (NUMBER_RE.test(text)) {
    return Number(text);
  }
  if (
    text.length >= 2 &&
    ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"')))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

/** Показывает значение переменной так же, как его вводят: строки в кавычках. */
export function formatSimulationVariable(value: boolean | number | string): string {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/**
 * Переменные задаются по строке на запись: `имя = значение`.
 * Пустые строки и строки, начинающиеся с `#`, пропускаются.
 */
export function parseSimulationVariables(text: string): ParsedVariables {
  const variables: Record<string, boolean | number | string> = {};
  const lines = text.split(/\r?\n/);
  for (const [offset, line] of lines.entries()) {
    const entry = line.trim();
    if (entry === '' || entry.startsWith('#')) {
      continue;
    }
    const separator = entry.indexOf('=');
    if (separator === -1) {
      return { variables, error: `Строка ${offset + 1}: ожидается «имя = значение»` };
    }
    const name = entry.slice(0, separator).trim();
    if (!NAME_RE.test(name)) {
      return {
        variables,
        error: `Строка ${offset + 1}: имя «${name}» должно быть латиницей, цифрами и «_»`,
      };
    }
    const rawValue = entry.slice(separator + 1).trim();
    if (rawValue === '') {
      return { variables, error: `Строка ${offset + 1}: у переменной «${name}» нет значения` };
    }
    variables[name] = parseValue(rawValue);
  }
  return { variables, error: null };
}
