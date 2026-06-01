import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { deleteModule } = vi.hoisted(() => ({ deleteModule: vi.fn() }));

vi.mock('@/lib/server/withTeam', () => ({
  withAdmin: (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
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
  },
}));

vi.mock('@/lib/db/modulesData', () => ({ deleteModule }));

import { DELETE } from '../route';

const PARAMS = { params: Promise.resolve({ id: 'mod123' }) };

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('DELETE /api/modules/[id]', () => {
  it('deletes a module and returns ok', async () => {
    deleteModule.mockResolvedValue(undefined);
    const res = await DELETE(new Request('http://x'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteModule).toHaveBeenCalledWith(db, 't1', 'mod123');
  });

  it('propagates ApiError from db layer (referential guard)', async () => {
    const { ApiError } = await import('@/lib/errors');
    deleteModule.mockRejectedValue(
      new ApiError(409, 'Module is still referenced by test cases'),
    );
    const res = await DELETE(new Request('http://x'), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/referenced/i);
  });
});
