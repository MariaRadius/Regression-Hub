import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { CACHE_CONTROL } from '@/lib/constants';

const { db, reset } = createMockDb();
const { countCasesByScope } = vi.hoisted(() => ({
  countCasesByScope: vi.fn(),
}));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: { user: { teamId: 't1' } },
      teamId: 't1',
      db,
    }),
  withAdmin: (handler) => (_req, _ctx) =>
    handler(_req, _ctx, {
      session: { user: { teamId: 't1', role: 'admin' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/testCasesData', () => ({ countCasesByScope }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/releases/[id]/scope-counts', () => {
  it('returns per-application and per-module counts for the release with a short cache', async () => {
    const counts = { byApplication: { app1: 3 }, byModule: { mod1: 2 } };
    countCasesByScope.mockResolvedValue(counts);

    const res = await GET(
      new Request('http://x/api/releases/r1/scope-counts'),
      { params: Promise.resolve({ id: 'r1' }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(counts);
    expect(countCasesByScope).toHaveBeenCalledWith(db, 't1', 'r1');
    expect(res.headers.get('Cache-Control')).toBe(CACHE_CONTROL.TINY);
  });
});
