import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { getTeamSettings } = vi.hoisted(() => ({
  getTeamSettings: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/settingsData', () => ({
  getTeamSettings,
}));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/settings', () => {
  it('returns qaUsers from db layer', async () => {
    getTeamSettings.mockResolvedValue({
      qaUsers: ['Alice', 'Bob'],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      qaUsers: ['Alice', 'Bob'],
    });
    expect(getTeamSettings).toHaveBeenCalledWith(db, 't1');
  });
});
