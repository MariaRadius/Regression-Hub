import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { resetTeamData } = vi.hoisted(() => ({
  resetTeamData: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler, admin) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: { user: { id: 'u1', teamId: 't1', role: admin ? 'admin' : 'qa' } },
        teamId: 't1',
        db,
      });
    } catch (err) {
      if (err?.name === 'ApiError') {
        const { NextResponse } = await import('next/server');
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  };
  return {
    withTeam: (handler) => wrap(handler, false),
    withAdmin: (handler) => wrap(handler, true),
  };
});

vi.mock('@/lib/db/testCasesData', () => ({ resetTeamData }));

import { POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('POST /api/test-cases/reset-team', () => {
  it('resets team data when confirm is RESET', async () => {
    resetTeamData.mockResolvedValue({
      testCases: 10,
      testRuns: 2,
      modules: 3,
      applications: 1,
      assignments: 0,
    });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'RESET' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deleted: {
        testCases: 10,
        testRuns: 2,
        modules: 3,
        applications: 1,
        assignments: 0,
      },
    });
    expect(resetTeamData).toHaveBeenCalledWith(db, 't1');
  });

  it('rejects without RESET confirm', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ confirm: 'NOPE' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(resetTeamData).not.toHaveBeenCalled();
  });
});
