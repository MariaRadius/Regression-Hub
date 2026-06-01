import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();

/**
 * @see {@link app/api/snapshots/route.js}
 */
const { listSnapshots } = vi.hoisted(() => ({
  listSnapshots: vi.fn(),
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

vi.mock('@/lib/db/reportSnapshotsData', () => ({ listSnapshots }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/snapshots', () => {
  it('returns 200 with the snapshot array', async () => {
    const fixtures = [
      {
        _id: 'snap1',
        releaseId: 'r1',
        releaseName: 'v1.0',
        environment: 'QA',
        generatedBy: 'Alice',
        generatedAt: '2026-06-01T00:00:00.000Z',
        filename: 'regression-signoff-v1.0-QA-2026-06-01.pdf',
        byteSize: 1024,
      },
    ];
    listSnapshots.mockResolvedValue(fixtures);

    const res = await GET(new Request('http://x/api/snapshots'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fixtures);
  });

  it('calls listSnapshots with (db, teamId)', async () => {
    listSnapshots.mockResolvedValue([]);

    await GET(new Request('http://x/api/snapshots'));

    expect(listSnapshots).toHaveBeenCalledWith(db, 't1');
    expect(listSnapshots).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array when no snapshots exist', async () => {
    listSnapshots.mockResolvedValue([]);

    const res = await GET(new Request('http://x/api/snapshots'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('propagates ApiError from listSnapshots as an error response', async () => {
    const { ApiError } = await import('@/lib/errors');
    listSnapshots.mockRejectedValue(new ApiError(400, 'teamId required'));

    const res = await GET(new Request('http://x/api/snapshots'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'teamId required' });
  });
});
