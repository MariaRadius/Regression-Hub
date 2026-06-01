import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { getTestCase, updateTestCase, deleteTestCase } = vi.hoisted(() => ({
  getTestCase: vi.fn(),
  updateTestCase: vi.fn(),
  deleteTestCase: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: {
          user: { id: 'u1', teamId: 't1', role: 'admin', name: 'Alice' },
        },
        teamId: 't1',
        db,
      });
    } catch (err) {
      if (err?.name === 'ApiError') {
        const { NextResponse } = await import('next/server');
        return NextResponse.json(
          { error: err.message },
          { status: err.status },
        );
      }
      throw err;
    }
  };
  return { withTeam: wrap, withAdmin: wrap };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/db/testCasesData', () => ({
  getTestCase,
  updateTestCase,
  deleteTestCase,
}));

import { DELETE, GET, PATCH } from '../route';

const PARAMS = {
  params: Promise.resolve({ id: '6642f000000000000000001a', caseId: 'tc123' }),
};

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/releases/[id]/test-cases/[caseId]', () => {
  it('returns a single test case', async () => {
    getTestCase.mockResolvedValue({ _id: 'tc123', name: 'Login test' });
    const res = await GET(new Request('http://x'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Login test' });
    expect(getTestCase).toHaveBeenCalledWith(db, 't1', 'tc123');
  });
});

describe('PATCH /api/releases/[id]/test-cases/[caseId]', () => {
  it('updates content fields', async () => {
    updateTestCase.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({
        name: 'Updated name',
        expectedResult: 'User sees dashboard',
      }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(200);
    expect(updateTestCase).toHaveBeenCalledWith(
      db,
      't1',
      'tc123',
      expect.any(Object),
      { actor: 'Alice' },
    );
  });
});

describe('DELETE /api/releases/[id]/test-cases/[caseId]', () => {
  it('deletes with confirm token', async () => {
    deleteTestCase.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    const res = await DELETE(req, PARAMS);
    expect(res.status).toBe(200);
    expect(deleteTestCase).toHaveBeenCalledWith(db, 't1', 'tc123', {
      actor: 'Alice',
    });
  });

  it('returns 400 without confirm token', async () => {
    const req = new Request('http://x', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'NOPE' }),
    });
    const res = await DELETE(req, PARAMS);
    expect(res.status).toBe(400);
    expect(deleteTestCase).not.toHaveBeenCalled();
  });
});
