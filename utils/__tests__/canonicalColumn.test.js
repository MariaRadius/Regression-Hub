import { describe, expect, it } from 'vitest';
import { canonicalColumn, normalizeHeader } from '../canonicalColumn';

describe('normalizeHeader', () => {
  it('lowercases and strips whitespace', () => {
    expect(normalizeHeader('Test Case')).toBe('testcase');
  });

  it('strips underscores and hyphens', () => {
    expect(normalizeHeader('Tested_By')).toBe('testedby');
    expect(normalizeHeader('Tested-By')).toBe('testedby');
  });

  it('strips slashes', () => {
    expect(normalizeHeader('Defects/Improvements')).toBe('defectsimprovements');
  });

  it('removes non-alphanumeric characters', () => {
    expect(normalizeHeader('Test (Case)!')).toBe('testcase');
  });

  it('handles null and undefined via empty-string fallback', () => {
    expect(normalizeHeader(null)).toBe('');
    expect(normalizeHeader(undefined)).toBe('');
  });
});

describe('canonicalColumn', () => {
  it('maps direct key matches', () => {
    expect(canonicalColumn('Type')).toBe('Type');
    expect(canonicalColumn('Status')).toBe('Status');
    expect(canonicalColumn('Module')).toBe('Module');
  });

  it('maps alias headers to canonical names', () => {
    expect(canonicalColumn('App')).toBe('Application');
    expect(canonicalColumn('Platform')).toBe('Application');
    expect(canonicalColumn('Test Case ID')).toBe('Test Case ID');
    expect(canonicalColumn('TC ID')).toBe('Test Case ID');
    expect(canonicalColumn('Test ID')).toBe('Test Case ID');
    expect(canonicalColumn('Test Steps')).toBe('Steps');
    expect(canonicalColumn('Expected')).toBe('Expected Result');
    expect(canonicalColumn('Actual')).toBe('Actual Result');
    expect(canonicalColumn('Tester')).toBe('Tested By');
    expect(canonicalColumn('Test Date')).toBe('Tested On');
    expect(canonicalColumn('Date')).toBe('Tested On');
    expect(canonicalColumn('Version')).toBe('Software Version Tested');
  });

  it('maps headers with spaces, slashes, and mixed case', () => {
    expect(canonicalColumn('Module Name')).toBe('Module');
    expect(canonicalColumn('Test Case Name')).toBe('Test Case');
    expect(canonicalColumn('Defects')).toBe('Defects/Improvements');
    expect(canonicalColumn('Improvements')).toBe('Defects/Improvements');
    expect(canonicalColumn('Tested On')).toBe('Tested On');
    expect(canonicalColumn('Tested By')).toBe('Tested By');
  });

  it('returns the original header for unknown columns', () => {
    expect(canonicalColumn('Custom Field')).toBe('Custom Field');
  });

  it('maps Notes aliases to Notes', () => {
    expect(canonicalColumn('Notes')).toBe('Notes');
    expect(canonicalColumn('Note')).toBe('Notes');
    expect(canonicalColumn('Comments')).toBe('Notes');
    expect(canonicalColumn('Comment')).toBe('Notes');
  });

  it('maps Platform Application compound header', () => {
    expect(canonicalColumn('Platform Application')).toBe('Application');
  });
});
