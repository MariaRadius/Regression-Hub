import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reset } = createMockDb();
const { listTestRuns } = vi.hoisted(() => ({ listTestRuns: vi.fn() }));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: { user: { teamId: 't1' } },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: { user: { teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/testRunsData', () => ({ listTestRuns }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/test-runs', () => {
  it('returns test runs', async () => {
    listTestRuns.mockResolvedValue([{ _id: 'r1' }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(listTestRuns).toHaveBeenCalledWith(db, 't1');
  });
});
