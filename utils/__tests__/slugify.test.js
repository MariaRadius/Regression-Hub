import { describe, expect, it } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  describe('valid input → expected slug', () => {
    it('lowercases ASCII letters', () => {
      expect(slugify('Hello World')).toBe('hello-world');
    });

    it('collapses a run of non-alphanumeric chars to a single hyphen', () => {
      expect(slugify('foo   bar')).toBe('foo-bar');
      expect(slugify('foo---bar')).toBe('foo-bar');
      expect(slugify('foo_._bar')).toBe('foo-bar');
    });

    it('trims leading hyphens', () => {
      expect(slugify('  leading spaces')).toBe('leading-spaces');
    });

    it('trims trailing hyphens', () => {
      expect(slugify('trailing spaces  ')).toBe('trailing-spaces');
    });

    it('trims both leading and trailing hyphens', () => {
      expect(slugify('---trim both---')).toBe('trim-both');
    });

    it('preserves digits', () => {
      expect(slugify('Version 2.4.1')).toBe('version-2-4-1');
    });

    it('handles already-valid slug-like input', () => {
      expect(slugify('login-test-case')).toBe('login-test-case');
    });

    it('handles mixed symbols and words', () => {
      expect(slugify('Test: Login & Logout (admin)')).toBe(
        'test-login-logout-admin',
      );
    });
  });

  describe('empty / invalid input → handled without throwing', () => {
    it('returns empty string for empty string input', () => {
      expect(slugify('')).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(slugify(undefined)).toBe('');
    });

    it('returns empty string for null', () => {
      expect(slugify(null)).toBe('');
    });

    it('returns empty string for a number', () => {
      expect(slugify(42)).toBe('');
    });

    it('returns empty string for an object', () => {
      expect(slugify({})).toBe('');
    });

    it('returns empty string for an array', () => {
      expect(slugify(['a', 'b'])).toBe('');
    });

    it('returns empty string for a string of only non-alphanumeric chars', () => {
      expect(slugify('!@#$%^&*()')).toBe('');
    });
  });

  describe('unicode / symbol-heavy edge cases', () => {
    it('drops accented characters that are not ASCII alphanumeric', () => {
      expect(slugify('Ação de Graças')).toBe('a-o-de-gra-as');
    });

    it('drops CJK characters', () => {
      expect(slugify('测试用例')).toBe('');
    });

    it('handles emoji mixed with words', () => {
      expect(slugify('Login 🚀 Test')).toBe('login-test');
    });

    it('handles string with only unicode symbols', () => {
      expect(slugify('💥🔥')).toBe('');
    });

    it('handles tabs and newlines as non-alphanumeric runs', () => {
      expect(slugify('step\tone\ntwo')).toBe('step-one-two');
    });
  });

  describe('length-cap edge cases', () => {
    it('does not truncate strings at or below the max length', () => {
      const input = 'a'.repeat(1000);
      expect(slugify(input)).toBe('a'.repeat(1000));
    });

    it('truncates slugs that exceed max length (1000 chars)', () => {
      const input = 'a'.repeat(2000);
      const result = slugify(input);
      expect(result.length).toBeLessThanOrEqual(1000);
    });

    it('does not leave a trailing hyphen after truncation', () => {
      // Build a string that would place a hyphen at the 1000-char cut:
      // "a" * 999 + " b...b" → slug "aaa...a-bbb..." truncated at 1000 lands
      // the hyphen at position 999; trim it off.
      const input = `${'a'.repeat(999)} ${'b'.repeat(1000)}`;
      const result = slugify(input);
      expect(result.length).toBeLessThanOrEqual(1000);
      expect(result.endsWith('-')).toBe(false);
    });

    it('preserves names longer than the legacy 100-char cap up to 1000 chars', () => {
      // Two names sharing the first 100 chars but diverging after must NOT
      // collapse to the same fingerprint anymore.
      const shared = 'a'.repeat(100);
      const left = slugify(`${shared} alpha branch`);
      const right = slugify(`${shared} beta branch`);
      expect(left).not.toBe(right);
      expect(left.length).toBeGreaterThan(100);
    });
  });
});
