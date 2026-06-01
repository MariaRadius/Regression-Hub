import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { getRelease, updateRelease, deleteRelease } = vi.hoisted(() => ({
  getRelease: vi.fn(),
  updateRelease: vi.fn(),
  deleteRelease: vi.fn(),
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
vi.mock('@/lib/db/releasesData', () => ({
  getRelease,
  updateRelease,
  deleteRelease,
}));

import { DELETE, GET, PATCH } from '../route';

const PARAMS = { params: Promise.resolve({ id: '6642f000000000000000001a' }) };

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/releases/[id]', () => {
  it('returns a single release', async () => {
    getRelease.mockResolvedValue({ _id: 'r1', name: 'v1.0', archived: false });
    const res = await GET(new Request('http://x'), PARAMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'v1.0' });
    expect(getRelease).toHaveBeenCalledWith(
      db,
      't1',
      '6642f000000000000000001a',
    );
  });
});

describe('PATCH /api/releases/[id]', () => {
  it('updates name', async () => {
    updateRelease.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'v1.1' }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(200);
    expect(updateRelease).toHaveBeenCalledWith(
      db,
      't1',
      '6642f000000000000000001a',
      { name: 'v1.1' },
      { actor: 'Alice' },
    );
  });

  it('archives a release', async () => {
    updateRelease.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({ archived: true }),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(200);
    expect(updateRelease).toHaveBeenCalledWith(
      db,
      't1',
      '6642f000000000000000001a',
      { archived: true },
      { actor: 'Alice' },
    );
  });

  it('returns 400 when body has no updatable fields', async () => {
    const req = new Request('http://x', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, PARAMS);
    expect(res.status).toBe(400);
    expect(updateRelease).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/releases/[id]', () => {
  it('deletes with confirm token', async () => {
    deleteRelease.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    const res = await DELETE(req, PARAMS);
    expect(res.status).toBe(200);
    expect(deleteRelease).toHaveBeenCalledWith(
      db,
      't1',
      '6642f000000000000000001a',
      { actor: 'Alice' },
    );
  });

  it('returns 400 without confirm token', async () => {
    const req = new Request('http://x', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'NOPE' }),
    });
    const res = await DELETE(req, PARAMS);
    expect(res.status).toBe(400);
    expect(deleteRelease).not.toHaveBeenCalled();
  });
});
