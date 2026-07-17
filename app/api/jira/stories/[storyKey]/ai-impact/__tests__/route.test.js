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

  it('returns empty impact WITHOUT calling the AI when the story matches the acknowledged snapshot', async () => {
    // Story content is identical to the last-acknowledged snapshot — nothing to
    // analyze. This must be deterministic, not left to the AI to decide.
    mocks.getStoryWatch.mockResolvedValue({
      acknowledgedAt: new Date(),
      acknowledgedSummary: 'New summary',
      acknowledgedDescription: 'Desc',
      acknowledgedAcceptanceCriteria: 'AC',
    });
    const res = await POST(makeReq(), makeCtx());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.impact.affectedCases).toEqual([]);
    expect(body.impact.newCases).toEqual([]);
    expect(body.impact.obsoleteCases).toEqual([]);
    expect(mocks.analyzeTestCaseImpact).not.toHaveBeenCalled();
  });

  it('still analyzes when only the acceptance criteria differs from the snapshot', async () => {
    mocks.getStoryWatch.mockResolvedValue({
      acknowledgedAt: new Date(),
      acknowledgedSummary: 'New summary',
      acknowledgedDescription: 'Desc',
      acknowledgedAcceptanceCriteria: 'OLD AC',
    });
    await POST(makeReq(), makeCtx());
    expect(mocks.analyzeTestCaseImpact).toHaveBeenCalled();
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

/**
 * End-to-end idempotency across repeated runs with a stateful watch.
 * Reproduces the reported bug: after applying AC-driven updates and
 * acknowledging, re-running must NOT re-surface the same cases — no matter how
 * many times it runs, and even after a genuine story update.
 */
describe('impact analysis idempotency across repeated runs', () => {
  let watchState;
  let storyState;

  // Simulates the dialog acknowledging the story after a successful apply:
  // copies the analyzed jira* snapshot into the acknowledged* fields.
  function simulateAcknowledge() {
    watchState.acknowledgedAt = new Date();
    watchState.acknowledgedSummary = watchState.jiraSummary;
    watchState.acknowledgedDescription = watchState.jiraDescription;
    watchState.acknowledgedAcceptanceCriteria =
      watchState.jiraAcceptanceCriteria;
  }

  beforeEach(() => {
    storyState = {
      key: 'RXR-1',
      summary: 'Admin listing',
      description: 'Desc v1',
      acceptanceCriteria: 'AC v1',
    };
    // A watch already exists (created by sync) but has never been acknowledged.
    watchState = {
      storyKey: 'RXR-1',
      jiraSummary: storyState.summary,
      jiraDescription: storyState.description,
      jiraAcceptanceCriteria: 'stale',
    };

    mocks.getStoryWatch.mockImplementation(async () => ({ ...watchState }));
    mocks.recordAnalyzedStorySnapshot.mockImplementation(
      async (_db, _team, _key, snap) => {
        Object.assign(watchState, snap);
      },
    );
    mocks.getJiraStory.mockImplementation(async () => ({ ...storyState }));
    // Realistic AI: returns one affected case whenever it is invoked at all.
    mocks.analyzeTestCaseImpact.mockResolvedValue({
      affectedCases: [{ id: 'tc1', reason: 'AC changed', update: {} }],
      newCases: [],
      obsoleteCases: [],
    });
  });

  async function runAnalysis() {
    const res = await POST(makeReq(), makeCtx());
    return (await res.json()).impact;
  }

  it('surfaces cases once, then stays empty across many re-runs after apply', async () => {
    // 1) First run — never acknowledged → AI runs, surfaces a case.
    let impact = await runAnalysis();
    expect(impact.affectedCases).toHaveLength(1);
    expect(mocks.analyzeTestCaseImpact).toHaveBeenCalledTimes(1);

    // 2) User applies + dialog acknowledges.
    simulateAcknowledge();

    // 3) Re-run 5 times — must stay empty and never call the AI again.
    for (let i = 0; i < 5; i++) {
      impact = await runAnalysis();
      expect(impact.affectedCases).toHaveLength(0);
      expect(impact.newCases).toHaveLength(0);
      expect(impact.obsoleteCases).toHaveLength(0);
    }
    expect(mocks.analyzeTestCaseImpact).toHaveBeenCalledTimes(1);
  });

  it('re-surfaces after a genuine story update, then stays empty again once applied', async () => {
    // First cycle: run → apply → acknowledge.
    await runAnalysis();
    simulateAcknowledge();
    expect((await runAnalysis()).affectedCases).toHaveLength(0);

    // Story acceptance criteria genuinely changes in Jira.
    storyState.acceptanceCriteria = 'AC v2 — add First Name column';

    // Next run detects the change and surfaces the case again.
    expect((await runAnalysis()).affectedCases).toHaveLength(1);

    // User applies the update + acknowledges the new snapshot.
    simulateAcknowledge();

    // Re-run 3 more times — must stay empty for the updated snapshot.
    for (let i = 0; i < 3; i++) {
      expect((await runAnalysis()).affectedCases).toHaveLength(0);
    }
  });
});
