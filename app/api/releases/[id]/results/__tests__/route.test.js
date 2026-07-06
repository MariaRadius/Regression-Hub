import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const {
  listResultsForRelease,
  recordResult,
  bulkRecordResult,
  validateEnvironment,
} = vi.hoisted(() => ({
  listResultsForRelease: vi.fn(),
  recordResult: vi.fn(),
  bulkRecordResult: vi.fn(),
  validateEnvironment: vi.fn(),
}));
const { getRelease } = vi.hoisted(() => ({ getRelease: vi.fn() }));
const { createIssuesForFailures } = vi.hoisted(() => ({
  createIssuesForFailures: vi.fn(),
}));
const { checkRateLimit } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/server/withTeam', () => {
  const makeWrap = (role) => (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: {
          user: { id: 'u1', teamId: 't1', role, name: 'Alice' },
        },
        teamId: 't1',
        db,
      });
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
  };
  return { withTeam: makeWrap('qa'), withAdmin: makeWrap('admin') };
});

vi.mock('@/lib/db/testResultsData', () => ({
  listResultsForRelease,
  recordResult,
  bulkRecordResult,
  validateEnvironment,
}));
vi.mock('@/lib/db/releasesData', () => ({ getRelease }));
vi.mock('@/lib/server/jiraOnFail', () => ({ createIssuesForFailures }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { GET, PATCH, POST } from '../route';

const RELEASE_ID = '6642f000000000000000001a';
const PARAMS = { params: Promise.resolve({ id: RELEASE_ID }) };
const ACTIVE_RELEASE = {
  _id: RELEASE_ID,
  archived: false,
  environments: ['QA', 'Sandbox'],
};

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  getRelease.mockResolvedValue(ACTIVE_RELEASE);
  validateEnvironment.mockReturnValue(undefined);
  checkRateLimit.mockReturnValue({ ok: true });
  createIssuesForFailures.mockResolvedValue(null);
});

describe('GET /api/releases/[id]/results', () => {
  it('lists results for a release', async () => {
    listResultsForRelease.mockResolvedValue([{ _id: 'res1', status: 'Pass' }]);
    const res = await GET(
      new Request(`http://x/api/releases/${RELEASE_ID}/results`),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(listResultsForRelease).toHaveBeenCalledWith(db, 't1', RELEASE_ID, {
      environment: undefined,
    });
  });

  it('filters by environment when provided', async () => {
    listResultsForRelease.mockResolvedValue([]);
    const res = await GET(
      new Request(`http://x/api/releases/${RELEASE_ID}/results?environment=QA`),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(listResultsForRelease).toHaveBeenCalledWith(db, 't1', RELEASE_ID, {
      environment: 'QA',
    });
  });
});

describe('POST /api/releases/[id]/results — BR-15 (QA forces self)', () => {
  it('records a Pass result; QA testedBy is forced to self', async () => {
    recordResult.mockResolvedValue(undefined);
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        tcId: '6642f000000000000000abc1',
        environment: 'QA',
        status: 'Pass',
        testedBy: 'SomeoneElse', // should be silently overridden for QA
      }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(200);
    expect(recordResult).toHaveBeenCalledWith(
      db,
      't1',
      RELEASE_ID,
      '6642f000000000000000abc1',
      'QA',
      expect.objectContaining({ status: 'Pass', testedBy: 'Alice' }),
    );
  });

  it('returns 400 when required fields are missing', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ environment: 'QA' }), // missing tcId and status
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(400);
    expect(recordResult).not.toHaveBeenCalled();
  });

  it('returns 409 when release is archived', async () => {
    getRelease.mockResolvedValue({ ...ACTIVE_RELEASE, archived: true });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        tcId: '6642f000000000000000abc1',
        environment: 'QA',
        status: 'Pass',
      }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(409);
    expect(recordResult).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit exceeded', async () => {
    checkRateLimit.mockReturnValue({ ok: false });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        tcId: '6642f000000000000000abc1',
        environment: 'QA',
        status: 'Pass',
      }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(429);
  });
});

describe('POST /api/releases/[id]/results — Jira issue on Fail', () => {
  function failRequest(extra = {}) {
    return new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        tcId: '6642f000000000000000abc1',
        environment: 'QA',
        status: 'Fail',
        notes: 'Crashed on relaunch',
        ...extra,
      }),
    });
  }

  it('asks the Jira layer after saving a Fail and returns its outcome', async () => {
    recordResult.mockResolvedValue(undefined);
    createIssuesForFailures.mockResolvedValue({
      created: [{ tcId: '6642f000000000000000abc1', key: 'RXR-5678' }],
      skipped: [],
      errors: [],
    });

    const res = await POST(failRequest(), PARAMS);

    expect(res.status).toBe(200);
    expect(createIssuesForFailures).toHaveBeenCalledWith(db, 't1', {
      release: ACTIVE_RELEASE,
      releaseId: RELEASE_ID,
      environment: 'QA',
      entries: [
        {
          tcId: '6642f000000000000000abc1',
          notes: 'Crashed on relaunch',
          testedBy: 'Alice',
        },
      ],
    });
    expect(await res.json()).toEqual({
      ok: true,
      jira: {
        created: [{ tcId: '6642f000000000000000abc1', key: 'RXR-5678' }],
        skipped: [],
        errors: [],
      },
    });
  });

  it('still returns ok with the jira errors when Jira creation fails', async () => {
    recordResult.mockResolvedValue(undefined);
    createIssuesForFailures.mockResolvedValue({
      created: [],
      skipped: [],
      errors: [{ tcId: '6642f000000000000000abc1', error: 'auth failed' }],
    });

    const res = await POST(failRequest(), PARAMS);

    expect(res.status).toBe(200);
    expect((await res.json()).jira.errors).toHaveLength(1);
  });

  it('omits jira from the response when the Jira layer declines (ask/off mode)', async () => {
    recordResult.mockResolvedValue(undefined);
    createIssuesForFailures.mockResolvedValue(null);
    const res = await POST(failRequest(), PARAMS);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not invoke the Jira layer for Pass results', async () => {
    recordResult.mockResolvedValue(undefined);
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        tcId: '6642f000000000000000abc1',
        environment: 'QA',
        status: 'Pass',
      }),
    });
    await POST(req, PARAMS);
    expect(createIssuesForFailures).not.toHaveBeenCalled();
  });
});

describe('POST /api/releases/[id]/results — Known Issue', () => {
  it('forwards jiraKey to recordResult and does not fire the Jira-on-fail flow', async () => {
    recordResult.mockResolvedValue(undefined);
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        tcId: '6642f000000000000000abc1',
        environment: 'QA',
        status: 'Known Issue',
        jiraKey: 'RXR-42',
      }),
    });
    const res = await POST(req, PARAMS);

    expect(res.status).toBe(200);
    expect(recordResult).toHaveBeenCalledWith(
      db,
      't1',
      RELEASE_ID,
      '6642f000000000000000abc1',
      'QA',
      expect.objectContaining({ status: 'Known Issue', jiraKey: 'RXR-42' }),
    );
    // Reclassifying a failure never creates a new Jira issue.
    expect(createIssuesForFailures).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('PATCH /api/releases/[id]/results — R21 bulk record', () => {
  it('bulk-records Pass for multiple cases', async () => {
    bulkRecordResult.mockResolvedValue(undefined);
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({
        environment: 'QA',
        status: 'Pass',
        tcIds: ['6642f000000000000000abc1', '6642f000000000000000abc2'],
      }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(200);
    expect(bulkRecordResult).toHaveBeenCalledWith(
      db,
      't1',
      RELEASE_ID,
      'QA',
      expect.arrayContaining([
        expect.objectContaining({
          tcId: '6642f000000000000000abc1',
          status: 'Pass',
        }),
        expect.objectContaining({
          tcId: '6642f000000000000000abc2',
          status: 'Pass',
        }),
      ]),
    );
  });

  it('bulk Fail forwards one Jira entry per case and returns the outcome', async () => {
    bulkRecordResult.mockResolvedValue(undefined);
    createIssuesForFailures.mockResolvedValue({
      created: [{ tcId: '6642f000000000000000abc1', key: 'RXR-5678' }],
      skipped: [
        { tcId: '6642f000000000000000abc2', reason: 'no-linked-story' },
      ],
      errors: [],
    });

    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({
        environment: 'QA',
        status: 'Fail',
        notes: 'Broken everywhere',
        tcIds: ['6642f000000000000000abc1', '6642f000000000000000abc2'],
      }),
    });
    const res = await PATCH(req, PARAMS);

    expect(res.status).toBe(200);
    expect(createIssuesForFailures).toHaveBeenCalledWith(db, 't1', {
      release: ACTIVE_RELEASE,
      releaseId: RELEASE_ID,
      environment: 'QA',
      entries: [
        {
          tcId: '6642f000000000000000abc1',
          notes: 'Broken everywhere',
          testedBy: 'Alice',
        },
        {
          tcId: '6642f000000000000000abc2',
          notes: 'Broken everywhere',
          testedBy: 'Alice',
        },
      ],
    });
    expect((await res.json()).jira.skipped).toHaveLength(1);
  });

  it('returns 400 when tcIds is empty', async () => {
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({ environment: 'QA', status: 'Pass', tcIds: [] }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(400);
    expect(bulkRecordResult).not.toHaveBeenCalled();
  });

  it('returns 409 when release is archived', async () => {
    getRelease.mockResolvedValue({ ...ACTIVE_RELEASE, archived: true });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({
        environment: 'QA',
        status: 'Pass',
        tcIds: ['6642f000000000000000abc1'],
      }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(409);
    expect(bulkRecordResult).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit exceeded', async () => {
    checkRateLimit.mockReturnValue({ ok: false });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({
        environment: 'QA',
        status: 'Pass',
        tcIds: ['6642f000000000000000abc1'],
      }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(429);
  });
});
