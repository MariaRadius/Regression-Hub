import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { createIssuesFromDrafts } = vi.hoisted(() => ({
  createIssuesFromDrafts: vi.fn(),
}));
const { getRelease } = vi.hoisted(() => ({ getRelease: vi.fn() }));
const { validateEnvironment } = vi.hoisted(() => ({
  validateEnvironment: vi.fn(),
}));
const { checkRateLimit } = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: {
          user: { id: 'u1', teamId: 't1', role: 'qa', name: 'Alice' },
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
  },
}));

vi.mock('@/lib/server/jiraOnFail', () => ({ createIssuesFromDrafts }));
vi.mock('@/lib/db/releasesData', () => ({ getRelease }));
vi.mock('@/lib/db/testResultsData', () => ({ validateEnvironment }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));

import { POST } from '../route';

const RELEASE_ID = '6642f000000000000000001a';
const PARAMS = { params: Promise.resolve({ id: RELEASE_ID }) };
const RELEASE = { _id: RELEASE_ID, name: 'v2.9', environments: ['QA'] };

function makeRequest(body) {
  return new Request('http://x', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  getRelease.mockResolvedValue(RELEASE);
  validateEnvironment.mockReturnValue(undefined);
  checkRateLimit.mockReturnValue({ ok: true });
});

describe('POST /api/releases/[id]/jira-issues', () => {
  const issues = [{ tcId: 'tc1', summary: 'Edited', description: 'Body' }];

  it('creates the reviewed drafts and returns the outcome', async () => {
    createIssuesFromDrafts.mockResolvedValue({
      created: [{ tcId: 'tc1', key: 'RXR-5678' }],
      skipped: [],
      errors: [],
    });

    const res = await POST(makeRequest({ environment: 'QA', issues }), PARAMS);

    expect(res.status).toBe(200);
    expect(createIssuesFromDrafts).toHaveBeenCalledWith(db, 't1', {
      releaseId: RELEASE_ID,
      environment: 'QA',
      issues,
    });
    expect(await res.json()).toEqual({
      created: [{ tcId: 'tc1', key: 'RXR-5678' }],
      skipped: [],
      errors: [],
    });
  });

  it('rejects an empty issues array or blank summary', async () => {
    let res = await POST(
      makeRequest({ environment: 'QA', issues: [] }),
      PARAMS,
    );
    expect(res.status).toBe(400);

    res = await POST(
      makeRequest({
        environment: 'QA',
        issues: [{ tcId: 'tc1', summary: '', description: 'd' }],
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(createIssuesFromDrafts).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValue({ ok: false });
    const res = await POST(makeRequest({ environment: 'QA', issues }), PARAMS);
    expect(res.status).toBe(429);
  });
});
