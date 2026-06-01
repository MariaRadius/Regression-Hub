import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { getExportData } = vi.hoisted(() => ({ getExportData: vi.fn() }));

vi.mock('@/lib/server/withTeam', () => ({
  withTeam: (handler) => (req, ctx) =>
    handler(req, ctx, {
      session: { user: { id: 'u1', teamId: 't1', role: 'qa' } },
      teamId: 't1',
      db,
    }),
}));

vi.mock('@/lib/db/exportData', () => ({ getExportData }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/export-data', () => {
  it('returns export rows scoped to releaseId + environment', async () => {
    getExportData.mockResolvedValue([{ testKey: 'RHE-0001', status: 'Pass' }]);
    const res = await GET(
      new Request(
        'http://x/api/export-data?releaseId=6642f000000000000000001a&environment=QA',
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
    expect(getExportData).toHaveBeenCalledWith(db, 't1', {
      releaseId: '6642f000000000000000001a',
      environment: 'QA',
    });
  });

  it('includes applicationId filter when provided', async () => {
    getExportData.mockResolvedValue([]);
    const res = await GET(
      new Request(
        'http://x/api/export-data?releaseId=6642f000000000000000001a&environment=QA&applicationId=app1',
      ),
    );
    expect(res.status).toBe(200);
    expect(getExportData).toHaveBeenCalledWith(db, 't1', {
      releaseId: '6642f000000000000000001a',
      environment: 'QA',
      applicationId: 'app1',
    });
  });

  it('omits applicationId from db call when not provided', async () => {
    getExportData.mockResolvedValue([]);
    await GET(
      new Request('http://x/api/export-data?releaseId=r1&environment=Sandbox'),
    );
    expect(getExportData).toHaveBeenCalledWith(db, 't1', {
      releaseId: 'r1',
      environment: 'Sandbox',
    });
  });
});
