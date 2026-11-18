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

/** Хосты, которым разрешено отдавать картинки в Markdown (через запятую). */
export function markdownImageHosts(
  raw: string | undefined = import.meta.env['VITE_MARKDOWN_IMAGE_HOSTS'] as string | undefined,
): string[] {
  return (raw ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Картинки в Markdown ограничены своим origin, data:image и явным allowlist.
 * CSP повторяет это же правило: чужие https-хосты не грузятся без настройки.
 */
export function isAllowedImageUrl(url: string, hosts = markdownImageHosts()): boolean {
  const trimmed = url.trim();
  if (trimmed === '' || hasUnsafeCharacters(trimmed) || trimmed.startsWith('//')) {
    return false;
  }
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('#')
  ) {
    return true;
  }
  if (/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return parsed.hostname === window.location.hostname || hosts.includes(parsed.hostname);
  } catch {
    return false;
  }
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
