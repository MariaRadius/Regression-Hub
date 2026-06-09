import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();

const {
  createEnvHealthJob,
  setJobCompleted,
  setJobFailed,
  setJobProcessing,
  computeEnvHealthReport,
} = vi.hoisted(() => ({
  createEnvHealthJob: vi.fn(),
  setJobProcessing: vi.fn(),
  setJobCompleted: vi.fn(),
  setJobFailed: vi.fn(),
  computeEnvHealthReport: vi.fn(),
}));

const afterFn = vi.hoisted(() => vi.fn());

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, after: afterFn };
});

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) =>
    handler(req, ctx, {
      session: { user: { teamId: 't1', name: 'Alice' } },
      teamId: 't1',
      db,
    });
  return { withTeam: wrap, withAdmin: wrap };
});

vi.mock('@/lib/db/envHealthData', () => ({
  createEnvHealthJob,
  setJobProcessing,
  setJobCompleted,
  setJobFailed,
  computeEnvHealthReport,
}));

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn(() => Promise.resolve(db)) }));

import { POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('POST /api/reports/env-health', () => {
  it('returns 202 with the jobId', async () => {
    createEnvHealthJob.mockResolvedValue('job123');
    afterFn.mockImplementation(() => {});

    const res = await POST(
      new Request('http://localhost/api/reports/env-health', {
        method: 'POST',
      }),
      {},
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe('job123');
  });

  it('registers an after() callback', async () => {
    createEnvHealthJob.mockResolvedValue('job456');
    afterFn.mockImplementation(() => {});

    await POST(
      new Request('http://localhost/api/reports/env-health', {
        method: 'POST',
      }),
      {},
    );

    expect(afterFn).toHaveBeenCalledOnce();
    expect(typeof afterFn.mock.calls[0][0]).toBe('function');
  });
});
