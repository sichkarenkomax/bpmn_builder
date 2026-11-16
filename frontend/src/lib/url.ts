/**
 * Схема ссылки допустима для перехода: http(s), mailto и относительные адреса.
 * Протокол-относительные (`//evil.com`) и адреса с обратными слэшами или
 * управляющими символами отклоняем: браузер нормализует их в чужой хост.
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '' || hasUnsafeCharacters(trimmed)) {
    return false;
  }
  if (trimmed.startsWith('//')) {
    return false;
  }
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return true;
  }
  return /^(https?:|mailto:)/i.test(trimmed);
}

/** Управляющие символы и обратные слэши: браузер нормализует их в путь/хост. */
function hasUnsafeCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || char === '\\') {
      return true;
    }
  }
  return false;
}
