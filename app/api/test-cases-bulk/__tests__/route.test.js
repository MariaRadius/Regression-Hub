import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { bulkUpdateTestCases, checkRateLimit } = vi.hoisted(() => ({
  bulkUpdateTestCases: vi.fn(),
  checkRateLimit: vi.fn(() => ({ ok: true })),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) => handler(req, ctx, {
    session: { user: { id: 'u1', teamId: 't1', role: 'qa' } },
    teamId: 't1',
    db,
  }),
  withAdmin: (handler) => (req, ctx) => handler(req, ctx, {
    session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
    teamId: 't1',
    db,
  }),
}));

vi.mock('@/lib/db/testCasesBulkData', () => ({ bulkUpdateTestCases }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));

import { PATCH } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('PATCH /api/test-cases-bulk', () => {
  it('bulk updates test cases', async () => {
    bulkUpdateTestCases.mockResolvedValue({ ok: true, updated: 5 });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({
        filter: { applicationId: 'a1' },
        fields: { status: 'Pass' },
      }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: 5 });
    expect(bulkUpdateTestCases).toHaveBeenCalledWith(db, 't1', {
      filter: { applicationId: 'a1' },
      fields: { status: 'Pass' },
    });
  });

  it('returns 429 when rate limited', async () => {
    checkRateLimit.mockReturnValue({ ok: false });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({ filter: {}, fields: { status: 'Pass' } }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(429);
    expect(bulkUpdateTestCases).not.toHaveBeenCalled();
  });
});
