import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeTestCaseImpact, isAiConfigured } from '@/lib/server/aiClient';

const SETTINGS = { aiProvider: 'openai', aiApiKey: 'key-x' };
const INPUT = {
  oldSummary: 'Login via email',
  oldDescription: 'Email + password login.',
  oldAcceptanceCriteria: 'Email + password fields visible.',
  newSummary: 'Login via email or SSO',
  newDescription: 'Email/password or SSO.',
  newAcceptanceCriteria: 'SSO button visible on login page.',
  existingTestCases: [
    {
      _id: 'tc-1',
      testCase: 'Login with valid credentials',
      preconditions: 'User exists',
      steps: '<ol><li>Enter email</li></ol>',
      expectedResult: 'Logged in',
      priority: 'High',
      type: 'Functional Test',
    },
  ],
};

const VALID_RESPONSE = JSON.stringify({
  affectedCases: [
    {
      id: 'tc-1',
      reason: 'Must cover SSO',
      update: { testCase: 'Login via email or SSO' },
    },
  ],
  newCases: [
    {
      testCase: 'SSO login',
      preconditions: '',
      steps: '<ol><li>Click SSO</li></ol>',
      expectedResult: 'Logged in via SSO',
      priority: 'High',
      type: 'Functional Test',
    },
  ],
  obsoleteCases: [],
});

function mockFetch(content) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content } }] }),
    }),
  );
}

beforeEach(() => vi.restoreAllMocks());

describe('isAiConfigured', () => {
  it('returns true when both fields set', () =>
    expect(isAiConfigured({ aiProvider: 'openai', aiApiKey: 'k' })).toBe(true));
  it('returns false when key missing', () =>
    expect(isAiConfigured({ aiProvider: 'openai', aiApiKey: '' })).toBe(false));
  it('returns false when provider missing', () =>
    expect(isAiConfigured({ aiProvider: null, aiApiKey: 'k' })).toBe(false));
});

describe('analyzeTestCaseImpact', () => {
  it('returns parsed impact on success', async () => {
    mockFetch(VALID_RESPONSE);
    const result = await analyzeTestCaseImpact(SETTINGS, INPUT);
    expect(result.affectedCases).toHaveLength(1);
    expect(result.affectedCases[0].id).toBe('tc-1');
    expect(result.newCases).toHaveLength(1);
    expect(result.obsoleteCases).toEqual([]);
  });

  it('throws when AI credentials missing', async () => {
    await expect(
      analyzeTestCaseImpact({ aiProvider: null, aiApiKey: null }, INPUT),
    ).rejects.toThrow('AI provider not configured');
  });

  it('throws when AI response missing required arrays', async () => {
    mockFetch('{"affectedCases":[]}'); // missing newCases and obsoleteCases
    await expect(analyzeTestCaseImpact(SETTINGS, INPUT)).rejects.toThrow(
      'AI returned unexpected format',
    );
  });

  it('handles empty existingTestCases gracefully', async () => {
    mockFetch(
      JSON.stringify({ affectedCases: [], newCases: [], obsoleteCases: [] }),
    );
    const result = await analyzeTestCaseImpact(SETTINGS, {
      ...INPUT,
      existingTestCases: [],
    });
    expect(result.affectedCases).toEqual([]);
  });
});
