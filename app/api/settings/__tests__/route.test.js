import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reset } = createMockDb();
const { getTeamSettings, updateTeamSettings, checkRateLimit } = vi.hoisted(
  () => ({
    getTeamSettings: vi.fn(),
    updateTeamSettings: vi.fn(),
    checkRateLimit: vi.fn(() => ({ ok: true })),
  })
);

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

vi.mock('@/lib/db/settingsData', () => ({
  getTeamSettings,
  updateTeamSettings,
}));

vi.mock('@/lib/rateLimit', () => ({ checkRateLimit }));

import { GET, PUT } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/settings', () => {
  it('returns settings from db layer', async () => {
    getTeamSettings.mockResolvedValue({
      qaUsers: ['A'],
      softwareVersion: '1.0',
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      qaUsers: ['A'],
      softwareVersion: '1.0',
    });
    expect(getTeamSettings).toHaveBeenCalledWith(db, 't1');
  });
});

describe('PUT /api/settings', () => {
  it('updates settings for admin', async () => {
    updateTeamSettings.mockResolvedValue(undefined);
    const req = new Request('http://x', {
      method: 'PUT',
      body: JSON.stringify({ softwareVersion: '2.0' }),
    });
    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateTeamSettings).toHaveBeenCalledWith(db, 't1', {
      softwareVersion: '2.0',
    });
  });
});
