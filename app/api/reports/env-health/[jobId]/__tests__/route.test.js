import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();

const { getEnvHealthJob } = vi.hoisted(() => ({ getEnvHealthJob: vi.fn() }));

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: { user: { teamId: 't1' } },
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

vi.mock('@/lib/db/envHealthData', () => ({ getEnvHealthJob }));

import { GET } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/reports/env-health/[jobId]', () => {
  it('returns 200 with the job doc', async () => {
    getEnvHealthJob.mockResolvedValue({
      _id: 'job1',
      status: 'processing',
      result: null,
    });
    const res = await GET(
      new Request('http://localhost/api/reports/env-health/job1'),
      { params: Promise.resolve({ jobId: 'job1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._id).toBe('job1');
    expect(body.status).toBe('processing');
  });

  it('returns 404 when job is not found', async () => {
    const { ApiError } = await import('@/lib/errors');
    getEnvHealthJob.mockRejectedValue(new ApiError(404, 'Job not found'));
    const res = await GET(
      new Request('http://localhost/api/reports/env-health/bad'),
      { params: Promise.resolve({ jobId: 'bad' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Job not found');
  });
});
