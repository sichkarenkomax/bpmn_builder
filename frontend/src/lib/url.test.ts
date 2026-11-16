import { describe, expect, it } from 'vitest';

import { isSafeUrl } from './url';

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
