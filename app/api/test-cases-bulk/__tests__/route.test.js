import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { ApiError } from '@/lib/errors';

const { db, reset } = createMockDb();

// Mutable session reference — tests swap this before each case.
let sessionUser = { id: 'u1', teamId: 't1', role: 'qa', name: 'Jane QA' };

const { bulkUpdateTestCases, getTeamSettings, checkRateLimit } = vi.hoisted(
  () => ({
    bulkUpdateTestCases: vi.fn(),
    getTeamSettings: vi.fn(),
    checkRateLimit: vi.fn(() => ({ ok: true })),
  }),
);

// Mirrors the real withTeam error-catching wrapper so ApiError propagates as a
// JSON Response rather than an unhandled throw.
vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: { user: sessionUser },
        teamId: 't1',
        db,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.payload ?? { error: err.message };
        return NextResponse.json(body, { status: err.status });
      }
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/db/testCasesBulkData', () => ({ bulkUpdateTestCases }));
vi.mock('@/lib/db/settingsData', () => ({ getTeamSettings }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));

import { PATCH } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  // Restore default implementations cleared by clearAllMocks.
  checkRateLimit.mockReturnValue({ ok: true });
  // Default back to QA user; individual tests override as needed.
  sessionUser = { id: 'u1', teamId: 't1', role: 'qa', name: 'Jane QA' };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(body) {
  return new Request('http://x', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// BR-15 — QA users may only record themselves as the tester
// ---------------------------------------------------------------------------

describe('BR-15 — testedBy enforcement for QA callers', () => {
  it('forces testedBy to the session user name when QA supplies a different name', async () => {
    getTeamSettings.mockResolvedValue({ qaUsers: ['Jane QA'] });
    bulkUpdateTestCases.mockResolvedValue({ ok: true, updated: 3 });

    const res = await PATCH(
      makeReq({
        filter: { applicationId: 'a1' },
        fields: { status: 'Pass', testedBy: 'Someone Else' },
      }),
    );

    expect(res.status).toBe(200);
    // The db layer must receive the session user's name, not the caller-supplied value.
    expect(bulkUpdateTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        fields: expect.objectContaining({ testedBy: 'Jane QA' }),
      }),
    );
  });

  it('leaves testedBy as-is when QA omits it', async () => {
    bulkUpdateTestCases.mockResolvedValue({ ok: true, updated: 2 });

    const res = await PATCH(
      makeReq({
        filter: { applicationId: 'a1' },
        fields: { status: 'Fail' },
      }),
    );

    expect(res.status).toBe(200);
    expect(bulkUpdateTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        fields: expect.not.objectContaining({ testedBy: expect.anything() }),
      }),
    );
    // getTeamSettings not called when testedBy absent
    expect(getTeamSettings).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// BR-15 — Admin callers retain their supplied testedBy unchanged
// ---------------------------------------------------------------------------

describe('BR-15 — testedBy preserved for Admin callers', () => {
  beforeEach(() => {
    sessionUser = { id: 'u2', teamId: 't1', role: 'admin', name: 'Admin User' };
  });

  it('passes the caller-supplied testedBy through to the db layer', async () => {
    getTeamSettings.mockResolvedValue({ qaUsers: ['Jane QA', 'Other QA'] });
    bulkUpdateTestCases.mockResolvedValue({ ok: true, updated: 4 });

    const res = await PATCH(
      makeReq({
        filter: { applicationId: 'a1' },
        fields: { status: 'Pass', testedBy: 'Other QA' },
      }),
    );

    expect(res.status).toBe(200);
    expect(bulkUpdateTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        fields: expect.objectContaining({ testedBy: 'Other QA' }),
      }),
    );
  });

  it('rejects testedBy when the name is not a registered QA user', async () => {
    getTeamSettings.mockResolvedValue({ qaUsers: ['Jane QA'] });

    const res = await PATCH(
      makeReq({
        filter: { applicationId: 'a1' },
        fields: { status: 'Pass', testedBy: 'Unknown Person' },
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/"Unknown Person" is not a registered QA user/);
    expect(bulkUpdateTestCases).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Other existing behaviours
// ---------------------------------------------------------------------------

describe('PATCH /api/test-cases-bulk — general', () => {
  it('bulk updates test cases without a testedBy field', async () => {
    bulkUpdateTestCases.mockResolvedValue({ ok: true, updated: 5 });

    const res = await PATCH(
      makeReq({
        filter: { applicationId: 'a1' },
        fields: { status: 'Pass' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 5 });
    expect(bulkUpdateTestCases).toHaveBeenCalledWith(db, 't1', {
      filter: { applicationId: 'a1' },
      fields: { status: 'Pass' },
      actor: 'Jane QA',
    });
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValue({ ok: false });

    const res = await PATCH(
      makeReq({ filter: {}, fields: { status: 'Pass' } }),
    );

    expect(res.status).toBe(429);
    expect(bulkUpdateTestCases).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        body: JSON.stringify({ filter: {}, fields: {} }),
      }),
    );

    expect(res.status).toBe(400);
    expect(bulkUpdateTestCases).not.toHaveBeenCalled();
  });
});
