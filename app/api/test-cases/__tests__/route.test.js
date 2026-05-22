import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { listTestCases, createTestCase } = vi.hoisted(() => ({
  listTestCases: vi.fn(),
  createTestCase: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) => handler(req, ctx, {
    session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
    teamId: 't1',
    db,
  }),
  withAdmin: (handler) => (req, ctx) => handler(req, ctx, {
    session: { user: { id: 'u1', teamId: 't1', role: 'admin' } },
    teamId: 't1',
    db,
  }),
}));

vi.mock('@/lib/db/testCasesData', () => ({ listTestCases, createTestCase }));

import { GET, POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/test-cases', () => {
  it('returns paginated test cases from db layer', async () => {
    listTestCases.mockResolvedValue({
      data: [{ _id: 'tc1' }],
      total: 1,
      page: 1,
      totalPages: 1,
      applications: [],
      modules: [],
    });
    const res = await GET(new Request('http://x/api/test-cases?page=1&limit=50'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ total: 1, data: [{ _id: 'tc1' }] });
    expect(listTestCases).toHaveBeenCalledWith(db, 't1', expect.objectContaining({ page: '1', limit: '50' }));
  });
});

describe('POST /api/test-cases', () => {
  it('creates a test case', async () => {
    createTestCase.mockResolvedValue({ ok: true, id: 'tc1' });
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify({
        applicationId: 'a1',
        moduleId: 'm1',
        testCase: 'Login flow',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 'tc1' });
    expect(createTestCase).toHaveBeenCalledWith(db, 't1', expect.objectContaining({
      applicationId: 'a1',
      moduleId: 'm1',
    }));
  });
});
