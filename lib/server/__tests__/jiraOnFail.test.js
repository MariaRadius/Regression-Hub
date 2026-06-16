import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JIRA_ISSUE_MODES } from '@/lib/constants';

const {
  createFailureIssue,
  getTeamSettings,
  getTestCase,
  isJiraConfigured,
  addResultJiraIssue,
} = vi.hoisted(() => ({
  createFailureIssue: vi.fn(),
  getTeamSettings: vi.fn(),
  getTestCase: vi.fn(),
  isJiraConfigured: vi.fn(),
  addResultJiraIssue: vi.fn(),
}));

vi.mock('@/lib/server/jiraClient', () => ({
  createFailureIssue,
  isJiraConfigured,
}));
vi.mock('@/lib/db/settingsData', () => ({ getTeamSettings }));
vi.mock('@/lib/db/testCasesData', () => ({ getTestCase }));
vi.mock('@/lib/db/testResultsData', () => ({ addResultJiraIssue }));

import {
  buildDraftsForFailures,
  createIssuesForFailures,
  createIssuesFromDrafts,
} from '@/lib/server/jiraOnFail';

const db = {};
const release = { _id: 'rel1', name: 'v2.9' };

const baseArgs = {
  release,
  releaseId: 'rel1',
  environment: 'QA',
  entries: [{ tcId: 'tc1', notes: 'Crashed', testedBy: 'Maria' }],
};

const storyCase = {
  _id: 'tc1',
  testKey: 'SAP-1',
  testCase: 'Login works',
  jiraStory: 'RXR-9012',
  moduleName: 'Auth',
  priority: 'High',
  steps: '<ol><li>Open</li><li>Sign in</li></ol>',
  expectedResult: 'Stays signed in.',
};

beforeEach(() => {
  vi.clearAllMocks();
  isJiraConfigured.mockReturnValue(true);
  getTeamSettings.mockResolvedValue({ jiraIssueMode: JIRA_ISSUE_MODES.AUTO });
  getTestCase.mockResolvedValue(storyCase);
  createFailureIssue.mockResolvedValue({ key: 'RXR-5678', linkError: null });
  addResultJiraIssue.mockResolvedValue(undefined);
});

describe('createIssuesForFailures (auto mode only)', () => {
  it('returns null without touching Jira when env vars are missing', async () => {
    isJiraConfigured.mockReturnValue(false);
    expect(await createIssuesForFailures(db, 't1', baseArgs)).toBeNull();
    expect(createFailureIssue).not.toHaveBeenCalled();
  });

  it('returns null when the team mode is off or ask (review flow handles ask)', async () => {
    getTeamSettings.mockResolvedValue({ jiraIssueMode: JIRA_ISSUE_MODES.OFF });
    expect(await createIssuesForFailures(db, 't1', baseArgs)).toBeNull();
    getTeamSettings.mockResolvedValue({ jiraIssueMode: JIRA_ISSUE_MODES.ASK });
    expect(await createIssuesForFailures(db, 't1', baseArgs)).toBeNull();
    expect(createFailureIssue).not.toHaveBeenCalled();
  });

  it('passes the JIRA_FIX_VERSION env var into the payload', async () => {
    vi.stubEnv('JIRA_FIX_VERSION', 'testRelease');
    await createIssuesForFailures(db, 't1', baseArgs);
    const [payload] = createFailureIssue.mock.calls[0];
    expect(payload.fields.fixVersions).toEqual([{ name: 'testRelease' }]);
    vi.unstubAllEnvs();
  });

  it('creates, links, and stores the key in auto mode', async () => {
    const out = await createIssuesForFailures(db, 't1', baseArgs);

    expect(createFailureIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({ project: { key: 'RXR' } }),
      }),
      'RXR-9012',
    );
    expect(addResultJiraIssue).toHaveBeenCalledWith(
      db,
      't1',
      'rel1',
      'tc1',
      'QA',
      'RXR-5678',
    );
    expect(out).toEqual({
      created: [{ tcId: 'tc1', key: 'RXR-5678' }],
      skipped: [],
      errors: [],
    });
  });

  it('skips cases without a linked story and collects per-case errors', async () => {
    getTestCase
      .mockResolvedValueOnce({ ...storyCase, jiraStory: null })
      .mockResolvedValueOnce({ ...storyCase, _id: 'tc2' });
    createFailureIssue.mockRejectedValueOnce(new Error('auth failed'));

    const out = await createIssuesForFailures(db, 't1', {
      ...baseArgs,
      entries: [
        { tcId: 'tc1', notes: 'n', testedBy: 'M' },
        { tcId: 'tc2', notes: 'n', testedBy: 'M' },
      ],
    });

    expect(out.skipped).toEqual([{ tcId: 'tc1', reason: 'no-linked-story' }]);
    expect(out.errors).toEqual([{ tcId: 'tc2', error: 'auth failed' }]);
  });
});

describe('buildDraftsForFailures', () => {
  it('returns one editable draft per case with steps and notes baked in', async () => {
    const out = await buildDraftsForFailures(db, 't1', baseArgs);

    expect(out.skipped).toEqual([]);
    expect(out.drafts).toHaveLength(1);
    const draft = out.drafts[0];
    expect(draft.tcId).toBe('tc1');
    expect(draft.summary).toBe('[QA] Login works — failed in v2.9');
    expect(draft.description).toContain('Steps to Reproduce:');
    expect(draft.description).toContain('1. Open');
    expect(draft.description).toContain('Actual Result:\nCrashed');
    expect(createFailureIssue).not.toHaveBeenCalled();
  });

  it('reports story-less cases as skipped', async () => {
    getTestCase.mockResolvedValue({ ...storyCase, jiraStory: null });
    const out = await buildDraftsForFailures(db, 't1', baseArgs);
    expect(out.drafts).toEqual([]);
    expect(out.skipped).toEqual([{ tcId: 'tc1', reason: 'no-linked-story' }]);
  });

  it('returns empty sets when the integration is unconfigured or off', async () => {
    isJiraConfigured.mockReturnValue(false);
    const out = await buildDraftsForFailures(db, 't1', baseArgs);
    expect(out).toEqual({ drafts: [], skipped: [] });
    expect(getTestCase).not.toHaveBeenCalled();
  });
});

describe('createIssuesFromDrafts', () => {
  const issues = [
    { tcId: 'tc1', summary: 'Edited summary', description: 'Edited body' },
  ];

  it('creates from the edited text but re-derives project/type/story server-side', async () => {
    const out = await createIssuesFromDrafts(db, 't1', {
      releaseId: 'rel1',
      environment: 'Production',
      issues,
    });

    const [payload, storyKey] = createFailureIssue.mock.calls[0];
    expect(storyKey).toBe('RXR-9012');
    expect(payload.fields.project).toEqual({ key: 'RXR' });
    expect(payload.fields.issuetype).toEqual({ name: 'Bug' });
    expect(payload.fields.summary).toBe('Edited summary');
    expect(addResultJiraIssue).toHaveBeenCalledWith(
      db,
      't1',
      'rel1',
      'tc1',
      'Production',
      'RXR-5678',
    );
    expect(out.created).toEqual([{ tcId: 'tc1', key: 'RXR-5678' }]);
  });

  it('skips story-less cases and collects errors without aborting', async () => {
    getTestCase
      .mockResolvedValueOnce({ ...storyCase, jiraStory: null })
      .mockResolvedValueOnce(storyCase);
    createFailureIssue.mockRejectedValueOnce(new Error('Jira down'));

    const out = await createIssuesFromDrafts(db, 't1', {
      releaseId: 'rel1',
      environment: 'QA',
      issues: [
        { tcId: 'tc1', summary: 's', description: 'd' },
        { tcId: 'tc2', summary: 's', description: 'd' },
      ],
    });

    expect(out.skipped).toEqual([{ tcId: 'tc1', reason: 'no-linked-story' }]);
    expect(out.errors).toEqual([{ tcId: 'tc2', error: 'Jira down' }]);
    expect(out.created).toEqual([]);
  });
});
