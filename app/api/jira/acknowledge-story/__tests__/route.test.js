import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();

const { acknowledgeStoryWatch, acknowledgeAllStoryWatches } = vi.hoisted(
  () => ({
    acknowledgeStoryWatch: vi.fn(),
    acknowledgeAllStoryWatches: vi.fn(),
  }),
);

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, { teamId: 't1', db });
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

vi.mock('@/lib/db/jiraStoryWatchesData', () => ({
  acknowledgeStoryWatch,
  acknowledgeAllStoryWatches,
}));

import { POST } from '../route';

function makeReq(body) {
  return new Request('http://x/api/jira/acknowledge-story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  acknowledgeStoryWatch.mockResolvedValue();
  acknowledgeAllStoryWatches.mockResolvedValue();
});

describe('POST /api/jira/acknowledge-story', () => {
  it('acknowledges a single story and returns { ok: true }', async () => {
    const res = await POST(makeReq({ storyKey: 'SAP-1' }), {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(acknowledgeStoryWatch).toHaveBeenCalledWith(db, 't1', 'SAP-1');
    expect(acknowledgeAllStoryWatches).not.toHaveBeenCalled();
  });

  it('acknowledges all stories when all: true', async () => {
    const res = await POST(makeReq({ all: true }), {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(acknowledgeAllStoryWatches).toHaveBeenCalledWith(db, 't1');
    expect(acknowledgeStoryWatch).not.toHaveBeenCalled();
  });

  it('returns 400 when body has neither storyKey nor all', async () => {
    const res = await POST(makeReq({}), {});
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty body', async () => {
    const req = new Request('http://x/api/jira/acknowledge-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const res = await POST(req, {});
    expect(res.status).toBe(400);
  });
});
