import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { PER_CASE_CATEGORIES } from '@/lib/constants';

const { db, reset } = createMockDb();
const { listEvents } = vi.hoisted(() => ({
  listEvents: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: {
          user: { id: 'u1', teamId: 't1', role: 'qa', name: 'Alice' },
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
  return { withTeam: wrap };
});

vi.mock('@/lib/db/eventsData', () => ({
  listEvents,
}));

import { GET } from '../route';

const PARAMS = {
  params: Promise.resolve({ id: 'rel-1', caseId: 'tc-123' }),
};

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/releases/[id]/test-cases/[caseId]/events', () => {
  it('returns the per-case event history for the active release', async () => {
    listEvents.mockResolvedValue([
      {
        _id: 'evt-1',
        category: 'result',
        action: 'pass',
        by: 'Maria',
        at: '2026-06-05T07:00:00.000Z',
      },
    ]);

    const res = await GET(new Request('http://x'), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({ _id: 'evt-1', action: 'pass' }),
    ]);
    expect(listEvents).toHaveBeenCalledWith(db, 't1', {
      tcId: 'tc-123',
      releaseId: 'rel-1',
      categories: PER_CASE_CATEGORIES,
    });
  });
});
