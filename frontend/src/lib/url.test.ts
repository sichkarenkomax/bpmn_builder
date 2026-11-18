import { describe, expect, it } from 'vitest';

import { isAllowedImageUrl, isSafeUrl } from './url';

describe('isAllowedImageUrl', () => {
  it('разрешает только allowlist для внешних картинок', () => {
    expect(isAllowedImageUrl('https://cdn.example.com/a.png', ['cdn.example.com'])).toBe(true);
    expect(isAllowedImageUrl('https://evil.example/a.png', ['cdn.example.com'])).toBe(false);
    expect(isAllowedImageUrl('/local.png', [])).toBe(true);
    expect(isAllowedImageUrl('data:image/png;base64,iVBORw0KGgo=', [])).toBe(true);
    expect(isAllowedImageUrl('javascript:alert(1)', [])).toBe(false);
  });
});

describe('isSafeUrl', () => {
  it('пропускает http(s), mailto и относительные пути', () => {
    expect(isSafeUrl('https://example.com/a?b=1')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('HTTPS://EXAMPLE.COM')).toBe(true);
    expect(isSafeUrl('mailto:user@example.com')).toBe(true);
    expect(isSafeUrl('/diagrams/1')).toBe(true);
    expect(isSafeUrl('./docs/readme.md')).toBe(true);
    expect(isSafeUrl('../up')).toBe(true);
    expect(isSafeUrl('#section')).toBe(true);
  });

  it('отклоняет опасные схемы и пустые значения', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox')).toBe(false);
  });

  it('не пропускает протокол-относительные ссылки и подмену слэшей', () => {
    expect(isSafeUrl('//evil.com')).toBe(false);
    expect(isSafeUrl('  //evil.com/path  ')).toBe(false);
    expect(isSafeUrl('/\\evil.com')).toBe(false);
    expect(isSafeUrl('\\\\evil.com')).toBe(false);
    expect(isSafeUrl('https:\\\\evil.com')).toBe(false);
  });
});
