import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dateStamp,
  formatTcId,
  normalizedStatus,
  normalizeText,
  toDateInputValue,
} from '../formatters';

describe('normalizedStatus', () => {
  it('returns Pass unchanged', () => {
    expect(normalizedStatus('Pass')).toBe('Pass');
  });

  it('returns Fail unchanged', () => {
    expect(normalizedStatus('Fail')).toBe('Fail');
  });

  it('converts empty string to Pending', () => {
    expect(normalizedStatus('')).toBe('Pending');
  });

  it('converts unrecognised values to Pending', () => {
    expect(normalizedStatus('N/A')).toBe('Pending');
    expect(normalizedStatus('pass')).toBe('Pending');
    expect(normalizedStatus(undefined)).toBe('Pending');
  });
});

describe('dateStamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today's date in YYYY-MM-DD format", () => {
    expect(dateStamp()).toBe('2025-03-15');
  });
});

describe('toDateInputValue', () => {
  it('returns empty string for falsy input', () => {
    expect(toDateInputValue('')).toBe('');
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue(undefined)).toBe('');
  });

  it('converts ISO datetime string to YYYY-MM-DD', () => {
    expect(toDateInputValue('2024-07-20T10:30:00.000Z')).toBe('2024-07-20');
  });

  it('returns YYYY-MM-DD unchanged when already in that format', () => {
    expect(toDateInputValue('2024-01-05')).toBe('2024-01-05');
  });

  it('returns empty string for non-date strings', () => {
    expect(toDateInputValue('not-a-date')).toBe('');
    expect(toDateInputValue('hello world')).toBe('');
  });

  it('accepts a Date object', () => {
    expect(toDateInputValue(new Date('2024-06-01T00:00:00Z'))).toBe(
      '2024-06-01',
    );
  });
});

describe('normalizeText', () => {
  it('returns empty string for null', () => {
    expect(normalizeText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeText(undefined)).toBe('');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('converts numbers to strings', () => {
    expect(normalizeText(42)).toBe('42');
  });

  it('returns the string as-is when no trimming needed', () => {
    expect(normalizeText('clean')).toBe('clean');
  });
});

describe('formatTcId', () => {
  it('formats a numeric testCaseId shorter than 4 digits with leading zeros', () => {
    expect(formatTcId({ testCaseId: 7, _id: 'abc' })).toBe('TC0007');
  });

  it('formats a string testCaseId shorter than 4 chars with leading zeros', () => {
    expect(formatTcId({ testCaseId: '42', _id: 'abc' })).toBe('TC0042');
  });

  it('does not truncate a testCaseId that is already 4+ characters', () => {
    expect(formatTcId({ testCaseId: '12345', _id: 'abc' })).toBe('TC12345');
  });

  it('falls back to _id when testCaseId is absent', () => {
    expect(formatTcId({ _id: '99' })).toBe('TC0099');
  });

  it('falls back to _id when testCaseId is falsy (empty string)', () => {
    expect(formatTcId({ testCaseId: '', _id: '3' })).toBe('TC0003');
  });

  it('prefers testCaseId over _id when both are present', () => {
    expect(formatTcId({ testCaseId: '5', _id: '999' })).toBe('TC0005');
  });
});
