import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, collections, reset } = createMockDb();

vi.mock('@/lib/db/util', () => ({
  toClientDoc: (doc) => ({ ...doc, _id: String(doc._id) }),
}));

// Lazily import after mocks are in place
let createEnvHealthJob,
  setJobProcessing,
  setJobCompleted,
  setJobFailed,
  getEnvHealthJob,
  computeEnvHealthReport;

beforeEach(async () => {
  reset();
  vi.resetModules();
  ({
    createEnvHealthJob,
    setJobProcessing,
    setJobCompleted,
    setJobFailed,
    getEnvHealthJob,
    computeEnvHealthReport,
  } = await import('@/lib/db/envHealthData'));
});

// ── createEnvHealthJob ───────────────────────────────────────────────────────

describe('createEnvHealthJob', () => {
  it('inserts a queued job and returns the string id', async () => {
    const insertedId = { toString: () => 'job1' };
    collections.envHealthJobs = {
      insertOne: vi.fn().mockResolvedValue({ insertedId }),
    };
    const jobId = await createEnvHealthJob(db, 't1', 'Alice');
    expect(collections.envHealthJobs.insertOne).toHaveBeenCalledOnce();
    const doc = collections.envHealthJobs.insertOne.mock.calls[0][0];
    expect(doc.teamId).toBe('t1');
    expect(doc.status).toBe('queued');
    expect(doc.createdBy).toBe('Alice');
    expect(jobId).toBe('job1');
  });

  it('throws when teamId is missing', async () => {
    await expect(createEnvHealthJob(db, '', 'Alice')).rejects.toThrow(
      'teamId required',
    );
  });
});

// ── setJobProcessing ─────────────────────────────────────────────────────────

describe('setJobProcessing', () => {
  it('updates status to processing', async () => {
    collections.envHealthJobs = { updateOne: vi.fn().mockResolvedValue({}) };
    await setJobProcessing(db, 'aaaaaaaaaaaaaaaaaaaaaaaa');
    const { $set } = collections.envHealthJobs.updateOne.mock.calls[0][1];
    expect($set.status).toBe('processing');
  });
});

// ── setJobCompleted ──────────────────────────────────────────────────────────

describe('setJobCompleted', () => {
  it('stores result and sets status to completed', async () => {
    collections.envHealthJobs = { updateOne: vi.fn().mockResolvedValue({}) };
    await setJobCompleted(db, 'aaaaaaaaaaaaaaaaaaaaaaaa', { trend: [] });
    const { $set } = collections.envHealthJobs.updateOne.mock.calls[0][1];
    expect($set.status).toBe('completed');
    expect($set.result).toEqual({ trend: [] });
  });
});

// ── setJobFailed ─────────────────────────────────────────────────────────────

describe('setJobFailed', () => {
  it('stores error string and sets status to failed', async () => {
    collections.envHealthJobs = { updateOne: vi.fn().mockResolvedValue({}) };
    await setJobFailed(db, 'aaaaaaaaaaaaaaaaaaaaaaaa', 'boom');
    const { $set } = collections.envHealthJobs.updateOne.mock.calls[0][1];
    expect($set.status).toBe('failed');
    expect($set.error).toBe('boom');
  });
});

// ── getEnvHealthJob ──────────────────────────────────────────────────────────

describe('getEnvHealthJob', () => {
  it('returns the job scoped by teamId', async () => {
    const raw = {
      _id: { toString: () => 'job1' },
      teamId: 't1',
      status: 'completed',
    };
    collections.envHealthJobs = { findOne: vi.fn().mockResolvedValue(raw) };
    const job = await getEnvHealthJob(db, 't1', 'aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(job._id).toBe('job1');
    expect(job.status).toBe('completed');
  });

  it('throws 404 when not found', async () => {
    collections.envHealthJobs = { findOne: vi.fn().mockResolvedValue(null) };
    await expect(
      getEnvHealthJob(db, 't1', 'aaaaaaaaaaaaaaaaaaaaaaaa'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws 404 for an invalid ObjectId', async () => {
    await expect(getEnvHealthJob(db, 't1', 'not-valid')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws when teamId is missing', async () => {
    await expect(
      getEnvHealthJob(db, '', 'aaaaaaaaaaaaaaaaaaaaaaaa'),
    ).rejects.toThrow('teamId required');
  });
});

// ── computeEnvHealthReport ───────────────────────────────────────────────────

describe('computeEnvHealthReport', () => {
  it('returns empty result when team has no releases', async () => {
    collections.releases = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          project: vi
            .fn()
            .mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    };
    const result = await computeEnvHealthReport(db, 't1');
    expect(result).toEqual({
      releases: [],
      environments: [],
      matrix: [],
      trend: [],
    });
  });

  it('builds matrix and trend from aggregation results', async () => {
    const releaseOid = { toString: () => 'r1' };
    collections.releases = {
      find: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          project: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([
              {
                _id: releaseOid,
                name: '2.10.0',
                environments: ['QA', 'Production'],
                archived: false,
                createdAt: new Date('2026-06-01'),
              },
            ]),
          }),
        }),
      }),
    };
    const mockAgg = [
      {
        _id: { releaseId: 'r1', environment: 'QA' },
        total: 10,
        passed: 8,
        failed: 1,
        pending: 1,
      },
      {
        _id: { releaseId: 'r1', environment: 'Production' },
        total: 10,
        passed: 10,
        failed: 0,
        pending: 0,
      },
    ];
    collections.testResults = {
      aggregate: vi
        .fn()
        .mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockAgg) }),
    };

    const result = await computeEnvHealthReport(db, 't1');

    expect(result.environments).toEqual(['Production', 'QA']);
    expect(result.trend).toHaveLength(1);
    expect(result.trend[0].releaseName).toBe('2.10.0');
    expect(result.trend[0].environments.QA).toBe(80);
    expect(result.trend[0].environments.Production).toBe(100);
    expect(result.trend[0].overall).toBe(90);

    const qaRow = result.matrix.find((m) => m.environment === 'QA');
    expect(qaRow.releases[0].passRate).toBe(80);
    expect(qaRow.releases[0].failed).toBe(1);
  });
});
