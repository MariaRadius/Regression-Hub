import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reset } = createMockDb();
const { updateAssignment, deleteAssignment } = vi.hoisted(() => ({
  updateAssignment: vi.fn(),
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
  updateAssignment,
  deleteAssignment,
}));

import { DELETE, PATCH } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('assignments [id] route', () => {
  it('PATCH updates', async () => {
    updateAssignment.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'T' }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: 'aid' }) });
    expect(res.status).toBe(200);
  });

  it('DELETE removes', async () => {
    deleteAssignment.mockResolvedValue({ ok: true });
    const res = await DELETE(new Request('http://x'), {
      params: Promise.resolve({ id: 'aid' }),
    });
    expect(res.status).toBe(200);
  });
});
