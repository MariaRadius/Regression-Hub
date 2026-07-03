import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  getTeamSettings: vi.fn(),
  isJiraConfigured: vi.fn(),
  isAiConfigured: vi.fn(),
  getJiraStory: vi.fn(),
  getStoryWatch: vi.fn(),
  recordAnalyzedStorySnapshot: vi.fn(),
  getTestCasesByStory: vi.fn(),
  analyzeTestCaseImpact: vi.fn(),
}));

vi.mock('@/lib/db/settingsData', () => ({
  getTeamSettings: mocks.getTeamSettings,
}));
vi.mock('@/lib/server/jiraClient', () => ({
  isJiraConfigured: mocks.isJiraConfigured,
  getJiraStory: mocks.getJiraStory,
}));
vi.mock('@/lib/server/aiClient', () => ({
  isAiConfigured: mocks.isAiConfigured,
  analyzeTestCaseImpact: mocks.analyzeTestCaseImpact,
}));
vi.mock('@/lib/db/jiraStoryWatchesData', () => ({
  getStoryWatch: mocks.getStoryWatch,
  recordAnalyzedStorySnapshot: mocks.recordAnalyzedStorySnapshot,
}));
vi.mock('@/lib/db/testCasesData', () => ({
  getTestCasesByStory: mocks.getTestCasesByStory,
}));

const fakeDb = {};
vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, { teamId: 't1', db: fakeDb });
    } catch (err) {
      if (err?.name === 'ApiError') {
        const { NextResponse } = await import('next/server');
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      throw err;
    }
  },
}));

import { POST } from '../route';

function makeReq(key = 'RXR-1') {
  return new Request(`http://x/api/jira/stories/${key}/ai-impact`, {
    method: 'POST',
  });
}
function makeCtx(key = 'RXR-1') {
  return { params: Promise.resolve({ storyKey: key }) };
}

const MOCK_IMPACT = {
  affectedCases: [{ id: 'tc1', reason: 'Changed', update: {} }],
  newCases: [],
  obsoleteCases: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTeamSettings.mockResolvedValue({
    jiraBaseUrl: 'https://x.atlassian.net',
    jiraEmail: 'a@b.com',
    jiraApiToken: 'tok',
    aiProvider: 'openai',
    aiApiKey: 'key',
  });
  mocks.isJiraConfigured.mockReturnValue(true);
  mocks.isAiConfigured.mockReturnValue(true);
  mocks.getStoryWatch.mockResolvedValue(null);
  mocks.getTestCasesByStory.mockResolvedValue([
    { _id: 'tc1', testCase: 'Login' },
  ]);
  mocks.getJiraStory.mockResolvedValue({
    key: 'RXR-1',
    summary: 'New summary',
    description: 'Desc',
    acceptanceCriteria: 'AC',
  });
  mocks.analyzeTestCaseImpact.mockResolvedValue(MOCK_IMPACT);
});

describe('POST /api/jira/stories/[storyKey]/ai-impact', () => {
  it('returns story + impact on valid input', async () => {
    const res = await POST(makeReq(), makeCtx());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.story.key).toBe('RXR-1');
    expect(body.impact.affectedCases).toHaveLength(1);
  });

  it('passes acknowledged snapshot (incl. acceptance criteria) as old values', async () => {
    mocks.getStoryWatch.mockResolvedValue({
      acknowledgedSummary: 'Old',
      acknowledgedDescription: 'Old desc',
      acknowledgedAcceptanceCriteria: 'Old AC',
    });
    await POST(makeReq(), makeCtx());
    expect(mocks.analyzeTestCaseImpact).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        oldSummary: 'Old',
        oldDescription: 'Old desc',
        oldAcceptanceCriteria: 'Old AC',
        newAcceptanceCriteria: 'AC',
      }),
    );
  });

  it('records the analyzed story snapshot so the next run can diff against it', async () => {
    await POST(makeReq(), makeCtx());
    expect(mocks.recordAnalyzedStorySnapshot).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      'RXR-1',
      expect.objectContaining({ jiraAcceptanceCriteria: 'AC' }),
    );
  });

  it('uses empty strings for old snapshot when no watch exists', async () => {
    await POST(makeReq(), makeCtx());
    expect(mocks.analyzeTestCaseImpact).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ oldSummary: '', oldDescription: '' }),
    );
  });

  it('returns 422 when Jira not configured', async () => {
    mocks.isJiraConfigured.mockReturnValue(false);
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(422);
  });

  it('returns 422 when AI not configured', async () => {
    mocks.isAiConfigured.mockReturnValue(false);
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(422);
  });

  it('returns 400 when storyKey format is invalid', async () => {
    const res = await POST(makeReq('bad-key'), makeCtx('bad-key'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when getJiraStory throws', async () => {
    mocks.getJiraStory.mockRejectedValue(new Error('Jira 404'));
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Jira 404');
  });

  it('returns 502 when analyzeTestCaseImpact throws', async () => {
    mocks.analyzeTestCaseImpact.mockRejectedValue(
      new Error('Gemini: quota exceeded'),
    );
    const res = await POST(makeReq(), makeCtx());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('Gemini: quota exceeded');
  });
});
