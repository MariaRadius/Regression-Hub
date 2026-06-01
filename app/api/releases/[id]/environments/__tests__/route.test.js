import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { addEnvironment, removeEnvironment } = vi.hoisted(() => ({
  addEnvironment: vi.fn(),
  removeEnvironment: vi.fn(),
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
vi.mock('@/lib/db/releasesData', () => ({ addEnvironment, removeEnvironment }));

import { DELETE, POST } from '../route';

const PARAMS = { params: Promise.resolve({ id: '6642f000000000000000001a' }) };

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('POST /api/releases/[id]/environments', () => {
  it('adds an environment with confirm token', async () => {
    addEnvironment.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ environment: 'Staging', confirm: 'DELETE' }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(201);
    expect(addEnvironment).toHaveBeenCalledWith(
      db,
      't1',
      '6642f000000000000000001a',
      'Staging',
      { actor: 'Alice' },
    );
  });

  it('returns 400 without confirm token', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ environment: 'Staging' }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(400);
    expect(addEnvironment).not.toHaveBeenCalled();
  });

  it('returns 400 when environment is blank', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ environment: '   ', confirm: 'DELETE' }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(400);
    expect(addEnvironment).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/releases/[id]/environments', () => {
  it('removes an environment with confirm token', async () => {
    removeEnvironment.mockResolvedValue({ ok: true });
    const req = new Request('http://x', {
      method: 'DELETE',
      body: JSON.stringify({ environment: 'Staging', confirm: 'DELETE' }),
    });
    const res = await DELETE(req, PARAMS);
    expect(res.status).toBe(200);
    expect(removeEnvironment).toHaveBeenCalledWith(
      db,
      't1',
      '6642f000000000000000001a',
      'Staging',
      { actor: 'Alice' },
    );
  });

  it('returns 400 without confirm token', async () => {
    const req = new Request('http://x', {
      method: 'DELETE',
      body: JSON.stringify({ environment: 'Staging' }),
    });
    const res = await DELETE(req, PARAMS);
    expect(res.status).toBe(400);
    expect(removeEnvironment).not.toHaveBeenCalled();
  });
});
