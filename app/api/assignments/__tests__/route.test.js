import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, reset } = createMockDb();
const { listAssignments, createAssignment } = vi.hoisted(() => ({
  listAssignments: vi.fn(),
  createAssignment: vi.fn(),
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
      session: { user: { teamId: 't1', name: 'Alice', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/assignmentsData', () => ({
  listAssignments,
  createAssignment,
}));

import { GET, POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('assignments route', () => {
  it('GET lists assignments', async () => {
    listAssignments.mockResolvedValue([]);
    const res = await GET(new Request('http://x/api/assignments?view=mine'));
    expect(res.status).toBe(200);
    expect(listAssignments).toHaveBeenCalledWith(db, 't1', {
      view: 'mine',
      userName: 'Alice',
    });
  });

  it('POST creates assignment', async () => {
    createAssignment.mockResolvedValue({
      ok: true,
      id: 'a1',
      testCaseCount: 2,
    });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        assignedTo: 'Bob',
        type: 'selection',
        testCaseIds: ['1', '2'],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
