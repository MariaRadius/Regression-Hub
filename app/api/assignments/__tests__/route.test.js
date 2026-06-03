import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { assignTestCases } = vi.hoisted(() => ({ assignTestCases: vi.fn() }));

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
vi.mock('@/lib/db/assignmentsData', () => ({ assignTestCases }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { POST } from '../route';

beforeEach(() => {
  reset();
  assignTestCases.mockReset();
});

describe('assignments route', () => {
  it('POST assigns test cases and returns the count', async () => {
    assignTestCases.mockResolvedValue({ ok: true, testCaseCount: 3 });
    const body = {
      releaseId: 'a'.repeat(24),
      assignedTo: 'bob',
      moduleIds: ['m1'],
      environments: ['QA'],
    };
    const req = { json: async () => body };
    const res = await POST(req, {});
    expect(assignTestCases).toHaveBeenCalledWith(db, 't1', body, {
      assignedBy: 'Alice',
    });
    expect(await res.json()).toEqual({ ok: true, testCaseCount: 3 });
  });
});
