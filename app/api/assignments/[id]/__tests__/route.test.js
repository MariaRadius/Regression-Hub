import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { deleteAssignment } = vi.hoisted(() => ({
  deleteAssignment: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { teamId: 't1', name: 'Alice' } },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/assignmentsData', () => ({
  deleteAssignment,
}));

import { DELETE } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('assignments [id] route', () => {
  it('DELETE removes', async () => {
    deleteAssignment.mockResolvedValue({ ok: true });
    const res = await DELETE(new Request('http://x'), {
      params: Promise.resolve({ id: 'aid' }),
    });
    expect(res.status).toBe(200);
  });
});
