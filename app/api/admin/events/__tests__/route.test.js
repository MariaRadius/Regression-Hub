import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { listAdminActivity } = vi.hoisted(() => ({
  listAdminActivity: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withAdmin: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/adminActivityData', () => ({ listAdminActivity }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/admin/events', () => {
  it('returns admin activity with the requested limit', async () => {
    listAdminActivity.mockResolvedValue([{ _id: 'evt-1' }]);

    const res = await GET(new Request('http://x/api/admin/events?limit=25'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ _id: 'evt-1' }]);
    expect(listAdminActivity).toHaveBeenCalledWith(db, 't1', { limit: 25 });
  });
});
