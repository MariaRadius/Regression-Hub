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
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));

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
        caseId: 'case-1',
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
      'case-1',
      'QA',
      expect.objectContaining({ status: 'Pass', testedBy: 'Alice' }),
    );
  });

  it('returns 400 when required fields are missing', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ environment: 'QA' }), // missing caseId and status
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
        caseId: 'case-1',
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
        caseId: 'case-1',
        environment: 'QA',
        status: 'Pass',
      }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(429);
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
        caseIds: ['c1', 'c2'],
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
        expect.objectContaining({ caseId: 'c1', status: 'Pass' }),
        expect.objectContaining({ caseId: 'c2', status: 'Pass' }),
      ]),
    );
  });

  it('returns 400 when caseIds is empty', async () => {
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({ environment: 'QA', status: 'Pass', caseIds: [] }),
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
        caseIds: ['c1'],
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
        caseIds: ['c1'],
      }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(429);
  });
});
