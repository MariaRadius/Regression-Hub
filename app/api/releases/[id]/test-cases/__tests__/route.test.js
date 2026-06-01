import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { listTestCases, createTestCase } = vi.hoisted(() => ({
  listTestCases: vi.fn(),
  createTestCase: vi.fn(),
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
vi.mock('@/lib/db/testCasesData', () => ({ listTestCases, createTestCase }));

import { GET, POST } from '../route';

const RELEASE_ID = '6642f000000000000000001a';
const PARAMS = { params: Promise.resolve({ id: RELEASE_ID }) };

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/releases/[id]/test-cases', () => {
  it('lists test cases for a release+environment', async () => {
    listTestCases.mockResolvedValue({ rows: [], total: 0 });
    const res = await GET(
      new Request(
        `http://x/api/releases/${RELEASE_ID}/test-cases?environment=QA`,
      ),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(listTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({ releaseId: RELEASE_ID, environment: 'QA' }),
    );
  });

  it('returns 400 when environment param is missing', async () => {
    const res = await GET(
      new Request(`http://x/api/releases/${RELEASE_ID}/test-cases`),
      PARAMS,
    );
    expect(res.status).toBe(400);
    expect(listTestCases).not.toHaveBeenCalled();
  });
});

describe('POST /api/releases/[id]/test-cases', () => {
  it('creates a test case in the release', async () => {
    createTestCase.mockResolvedValue({ _id: 'tc1', testKey: 'RHE-0001' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Login works',
        applicationId: 'app1',
        moduleId: 'mod1',
        expectedResult: 'User is logged in',
      }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(201);
    expect(createTestCase).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({ releaseId: RELEASE_ID }),
    );
  });
});
