import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { deleteApplication } = vi.hoisted(() => ({
  deleteApplication: vi.fn(),
}));

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

vi.mock('@/lib/db/applicationsData', () => ({ deleteApplication }));

import { DELETE } from '../route';

const PARAMS = { params: Promise.resolve({ id: 'app123' }) };

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('DELETE /api/applications/[id]', () => {
  it('deletes an application and returns ok', async () => {
    deleteApplication.mockResolvedValue(undefined);
    const res = await DELETE(new Request('http://x'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(deleteApplication).toHaveBeenCalledWith(db, 't1', 'app123');
  });

  it('propagates ApiError from db layer (referential guard)', async () => {
    const { ApiError } = await import('@/lib/errors');
    deleteApplication.mockRejectedValue(
      new ApiError(409, 'Application is still referenced by test cases'),
    );
    const res = await DELETE(new Request('http://x'), PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/referenced/i);
  });
});
