import { describe, expect, it } from 'vitest';

import { isElementLocked } from './lock';

describe('isElementLocked', () => {
  it('читает закрепление из объявленного свойства DI', () => {
    expect(isElementLocked({ locked: true })).toBe(true);
    expect(isElementLocked({ locked: 'true' })).toBe(true);
    expect(isElementLocked({ locked: false })).toBe(false);
  });

  it('читает закрепление из `$attrs` после импорта XML', () => {
    expect(isElementLocked({ $attrs: { 'bs:locked': 'true' } })).toBe(true);
    expect(isElementLocked({ $attrs: {} })).toBe(false);
  });

  it('считает пустой DI незакреплённым', () => {
    expect(isElementLocked(undefined)).toBe(false);
  });
});
