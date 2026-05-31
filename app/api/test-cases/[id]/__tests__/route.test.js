import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { ROLES } from '@/lib/constants';

const { db, reset } = createMockDb();

// Mutable role slot — tests reassign this before each call
let callerRole = ROLES.QA;

const { getTestCase, updateTestCase } = vi.hoisted(() => ({
  getTestCase: vi.fn(),
  updateTestCase: vi.fn(),
}));

const { getTeamSettings } = vi.hoisted(() => ({
  getTeamSettings: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: { user: { id: 'u1', teamId: 't1', role: callerRole } },
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
  return { withTeam: wrap };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/testCasesData', () => ({ getTestCase, updateTestCase }));
vi.mock('@/lib/db/settingsData', () => ({ getTeamSettings }));

import { GET, PATCH } from '../route';

/** Helper: build a PATCH Request with a JSON body */
const patchReq = (body) =>
  new Request('http://x/api/test-cases/tc1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

/** Params stub that route.js awaits */
const ctx = { params: Promise.resolve({ id: 'tc1' }) };

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  callerRole = ROLES.QA;
  // Default settings — 'qa-user@example.com' is a registered QA user
  getTeamSettings.mockResolvedValue({ qaUsers: ['qa-user@example.com'] });
  updateTestCase.mockResolvedValue({ _id: 'tc1', status: 'Pass' });
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
describe('GET /api/test-cases/[id]', () => {
  it('returns the test case from the db layer', async () => {
    getTestCase.mockResolvedValue({ _id: 'tc1', testCase: 'Login flow' });
    const res = await GET(new Request('http://x/api/test-cases/tc1'), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ _id: 'tc1' });
    expect(getTestCase).toHaveBeenCalledWith(db, 't1', 'tc1');
  });
});

// ---------------------------------------------------------------------------
// PATCH — BR-15: QA cannot change testedBy
// ---------------------------------------------------------------------------
describe('PATCH /api/test-cases/[id] — BR-15 testedBy enforcement', () => {
  it('QA: testedBy in payload is silently ignored — updateTestCase receives no testedBy', async () => {
    callerRole = ROLES.QA;
    const res = await PATCH(
      patchReq({ status: 'Pass', testedBy: 'qa-user@example.com' }),
      ctx,
    );
    expect(res.status).toBe(200);
    const [, , , passedData] = updateTestCase.mock.calls[0];
    expect(passedData).not.toHaveProperty('testedBy');
  });

  it('QA: payload with ONLY testedBy still succeeds and does not write testedBy', async () => {
    callerRole = ROLES.QA;
    const res = await PATCH(patchReq({ testedBy: 'qa-user@example.com' }), ctx);
    // Payload passes schema (testedBy is passthrough); BR-15 strips it before updateTestCase
    expect(res.status).toBe(200);
    const [, , , passedData] = updateTestCase.mock.calls[0];
    expect(passedData).not.toHaveProperty('testedBy');
    // Settings lookup is skipped because testedBy was removed before the R21 guard
    expect(getTeamSettings).not.toHaveBeenCalled();
  });

  it('Admin: testedBy in payload IS honored — updateTestCase receives the value', async () => {
    callerRole = ROLES.ADMIN;
    const res = await PATCH(
      patchReq({ status: 'Pass', testedBy: 'qa-user@example.com' }),
      ctx,
    );
    expect(res.status).toBe(200);
    const [, , , passedData] = updateTestCase.mock.calls[0];
    expect(passedData).toHaveProperty('testedBy', 'qa-user@example.com');
  });

  it('Admin: testedBy rejected when value is not a registered QA user (R21)', async () => {
    callerRole = ROLES.ADMIN;
    const res = await PATCH(
      patchReq({ testedBy: 'notregistered@example.com' }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not a registered QA user/);
    expect(updateTestCase).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH — general validation
// ---------------------------------------------------------------------------
describe('PATCH /api/test-cases/[id] — validation', () => {
  it('returns 400 for an invalid status value', async () => {
    callerRole = ROLES.ADMIN;
    const res = await PATCH(patchReq({ status: 'Broken' }), ctx);
    expect(res.status).toBe(400);
    expect(updateTestCase).not.toHaveBeenCalled();
  });

  it('valid payload without testedBy calls updateTestCase and revalidates', async () => {
    callerRole = ROLES.ADMIN;
    const { revalidatePath } = await import('next/cache');
    const res = await PATCH(patchReq({ status: 'Pass' }), ctx);
    expect(res.status).toBe(200);
    expect(updateTestCase).toHaveBeenCalledWith(
      db,
      't1',
      'tc1',
      expect.objectContaining({ status: 'Pass' }),
      { actor: undefined },
    );
    expect(revalidatePath).toHaveBeenCalled();
  });
});
