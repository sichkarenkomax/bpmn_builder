/** Схема ссылки допустима для перехода: http(s), mailto и относительные адреса. */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '') {
    return false;
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('#') || trimmed.startsWith('./')) {
    return true;
  }
  return /^(https?:|mailto:)/i.test(trimmed);
}
