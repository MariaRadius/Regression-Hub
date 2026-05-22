import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reset } = createMockDb();
const { listApplications } = vi.hoisted(() => ({ listApplications: vi.fn() }));

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

vi.mock('@/lib/db/applicationsData', () => ({ listApplications }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/applications', () => {
  it('returns applications list', async () => {
    listApplications.mockResolvedValue([{ _id: 'a1', name: 'App' }]);
    const res = await GET(new Request('http://x/api/applications'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ _id: 'a1', name: 'App' }]);
    expect(listApplications).toHaveBeenCalledWith(db, 't1');
  });
});
