import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { listTestCases, createTestCase, findPotentialDuplicates } = vi.hoisted(
  () => ({
    listTestCases: vi.fn(),
    createTestCase: vi.fn(),
    findPotentialDuplicates: vi.fn(),
  }),
);

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
vi.mock('@/lib/db/testCasesData', () => ({
  listTestCases,
  createTestCase,
  findPotentialDuplicates,
}));

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

  it('forwards search and sort query params', async () => {
    listTestCases.mockResolvedValue({ rows: [], total: 0 });
    const res = await GET(
      new Request(
        `http://x/api/releases/${RELEASE_ID}/test-cases?environment=QA&q=maria&sortBy=testCase&sortDir=desc`,
      ),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(listTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        releaseId: RELEASE_ID,
        environment: 'QA',
        q: 'maria',
        sortBy: 'testCase',
        sortDir: 'desc',
      }),
    );
  });

  it('forwards an exact testKey filter for deep links', async () => {
    listTestCases.mockResolvedValue({ rows: [], total: 0 });
    const res = await GET(
      new Request(
        `http://x/api/releases/${RELEASE_ID}/test-cases?environment=QA&status=Fail&testKey=SAP-0454`,
      ),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(listTestCases).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        releaseId: RELEASE_ID,
        environment: 'QA',
        status: 'Fail',
        testKey: 'SAP-0454',
      }),
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
    findPotentialDuplicates.mockResolvedValue([]);
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

  it('returns 409 when a potential duplicate is found', async () => {
    findPotentialDuplicates.mockResolvedValue([
      {
        id: 'existing1',
        testCase: 'Login validates credentials',
        testKey: 'APP-0001',
      },
    ]);
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        testCase: 'Login validates credentials',
        applicationId: 'app1',
        moduleId: 'mod1',
      }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/duplicate/i);
    expect(body.duplicates).toHaveLength(1);
    expect(body.duplicates[0].testKey).toBe('APP-0001');
    expect(createTestCase).not.toHaveBeenCalled();
  });

  it('bypasses duplicate check when force=true query param is set', async () => {
    findPotentialDuplicates.mockResolvedValue([
      {
        id: 'existing1',
        testCase: 'Login validates credentials',
        testKey: 'APP-0001',
      },
    ]);
    createTestCase.mockResolvedValue({ ok: true, id: 'new1' });
    const req = new Request(`http://x?force=true`, {
      method: 'POST',
      body: JSON.stringify({
        testCase: 'Login validates credentials',
        applicationId: 'app1',
        moduleId: 'mod1',
      }),
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(201);
    expect(createTestCase).toHaveBeenCalled();
    expect(findPotentialDuplicates).not.toHaveBeenCalled();
  });

  it('stores source:"ai" when provided in body', async () => {
    findPotentialDuplicates.mockResolvedValue([]);
    createTestCase.mockResolvedValue({ ok: true, id: 'new-id' });

    const res = await POST(
      new Request(`http://x/api/releases/${RELEASE_ID}/test-cases`, {
        method: 'POST',
        body: JSON.stringify({
          applicationId: new ObjectId().toString(),
          moduleId: new ObjectId().toString(),
          testCase: 'AI generated case',
          source: 'ai',
        }),
      }),
      PARAMS,
    );

    expect(res.status).toBe(201);
    expect(createTestCase).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({ source: 'ai' }),
    );
  });

  it('defaults source to "manual" when not provided', async () => {
    findPotentialDuplicates.mockResolvedValue([]);
    createTestCase.mockResolvedValue({ ok: true, id: 'new-id' });

    await POST(
      new Request(`http://x/api/releases/${RELEASE_ID}/test-cases`, {
        method: 'POST',
        body: JSON.stringify({
          applicationId: new ObjectId().toString(),
          moduleId: new ObjectId().toString(),
          testCase: 'Manual case',
        }),
      }),
      PARAMS,
    );

    expect(createTestCase).toHaveBeenCalledWith(
      db,
      't1',
      expect.not.objectContaining({ source: 'ai' }),
    );
  });
});
