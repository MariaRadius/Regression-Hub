import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { listReleases, createRelease } = vi.hoisted(() => ({
  listReleases: vi.fn(),
  createRelease: vi.fn(),
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
vi.mock('@/lib/db/releasesData', () => ({ listReleases, createRelease }));

import { GET, POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/releases', () => {
  it('lists non-archived releases by default', async () => {
    listReleases.mockResolvedValue([
      { _id: 'r1', name: 'v1.0', archived: false },
    ]);
    const res = await GET(new Request('http://x/api/releases'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(listReleases).toHaveBeenCalledWith(db, 't1', {
      includeArchived: false,
    });
  });

  it('includes archived when ?includeArchived=true', async () => {
    listReleases.mockResolvedValue([]);
    const res = await GET(
      new Request('http://x/api/releases?includeArchived=true'),
    );
    expect(res.status).toBe(200);
    expect(listReleases).toHaveBeenCalledWith(db, 't1', {
      includeArchived: true,
    });
  });
});

describe('POST /api/releases', () => {
  it('creates an empty release', async () => {
    createRelease.mockResolvedValue({ ok: true, id: 'r1' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ name: 'v1.0', environments: ['QA'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(createRelease).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({ name: 'v1.0' }),
      { actor: 'Alice' },
    );
  });

  it('creates a clone release with carryAssignments', async () => {
    createRelease.mockResolvedValue({ ok: true, id: 'r2' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        name: 'v1.1',
        environments: ['QA'],
        cloneFromId: '6642f000000000000000001a',
        carryAssignments: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('returns 400 when name is missing', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({ environments: ['QA'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('name is required');
    expect(createRelease).not.toHaveBeenCalled();
  });
});
