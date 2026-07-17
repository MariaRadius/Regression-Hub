import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const getAiGeneratedTestCases = vi.hoisted(() => vi.fn());

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

vi.mock('@/lib/db/testCasesData', () => ({ getAiGeneratedTestCases }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/test-cases/generated', () => {
  it('returns cases and total', async () => {
    getAiGeneratedTestCases.mockResolvedValue({
      cases: [{ _id: 'abc', testCase: 'AI case' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });
    const res = await GET(new Request('http://x/api/test-cases/generated'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.cases).toHaveLength(1);
    expect(getAiGeneratedTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({ page: '1' }),
    );
  });

  it('forwards appId, moduleId, search query params', async () => {
    getAiGeneratedTestCases.mockResolvedValue({
      cases: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });
    await GET(
      new Request(
        'http://x/api/test-cases/generated?appId=app1&moduleId=mod1&search=login',
      ),
    );
    expect(getAiGeneratedTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        appId: 'app1',
        moduleId: 'mod1',
        search: 'login',
      }),
    );
  });

  it('returns empty list gracefully', async () => {
    getAiGeneratedTestCases.mockResolvedValue({
      cases: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });
    const res = await GET(new Request('http://x/api/test-cases/generated'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cases).toEqual([]);
  });
});
