import { describe, expect, it } from 'vitest';
import { getInvalidKeys, parseStoryKeys } from '@/utils/jiraStories';

describe('parseStoryKeys', () => {
  it('parses valid comma-separated keys', () => {
    expect(parseStoryKeys('SSO-123, REX-456')).toEqual(['SSO-123', 'REX-456']);
  });

  it('uppercases input before validation', () => {
    expect(parseStoryKeys('sso-123')).toEqual(['SSO-123']);
  });

  it('extracts key from a Jira browse URL segment', () => {
    expect(parseStoryKeys('https://jira.example.com/browse/SSO-123')).toEqual([
      'SSO-123',
    ]);
  });

  it('filters out empty segments', () => {
    expect(parseStoryKeys('SSO-123,  , REX-456')).toEqual([
      'SSO-123',
      'REX-456',
    ]);
  });

  it('deduplicates repeated keys', () => {
    expect(parseStoryKeys('SSO-123, SSO-123, REX-456')).toEqual([
      'SSO-123',
      'REX-456',
    ]);
  });

  it('caps at 10 keys', () => {
    const raw = Array.from({ length: 12 }, (_, i) => `KEY-${i + 1}`).join(', ');
    expect(parseStoryKeys(raw)).toHaveLength(10);
  });

  it('returns empty array for blank input', () => {
    expect(parseStoryKeys('')).toEqual([]);
    expect(parseStoryKeys('  ')).toEqual([]);
  });
});

describe('getInvalidKeys', () => {
  it('returns segments that are not valid Jira keys', () => {
    expect(getInvalidKeys('SSO-123, oops, REX-456')).toEqual(['OOPS']);
  });

  it('returns empty array when all keys are valid', () => {
    expect(getInvalidKeys('SSO-123, REX-456')).toEqual([]);
  });

  it('ignores empty segments', () => {
    expect(getInvalidKeys('SSO-123, , ')).toEqual([]);
  });

  it('treats bare numbers or bare letters as invalid', () => {
    expect(getInvalidKeys('123, ABC')).toEqual(['123', 'ABC']);
  });
});
