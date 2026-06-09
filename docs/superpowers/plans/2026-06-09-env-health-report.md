# Environment Health & Release Trend Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline "Environment Health & Release Trend" report to the Reports page that aggregates pass/fail/pending data across every release and environment, runs the heavy DB work as a non-blocking background job via `after()`, and exposes queued → processing → completed → failed states to the user.

**Architecture:** A button in ReportsClient triggers `POST /api/reports/env-health`, which inserts a job document in MongoDB and fires `after()` to run two MongoDB aggregation pipelines (results per release×environment; overall per release). The client polls `GET /api/reports/env-health/[jobId]` every 3 s until terminal state. The completed result is rendered inline — a pass-rate matrix (environments × releases) and a chronological trend list — no PDF.

**Tech Stack:** Next.js 16 `after()`, MongoDB aggregation, MUI Table/Stack, Vitest + `@testing-library/react`, existing `withTeam`/`withAdmin` wrappers, `lib/http/client` helpers, `toClientDoc`, `ApiError`.

---

## File Map

| Action   | Path                                                                 | Responsibility                                    |
|----------|----------------------------------------------------------------------|---------------------------------------------------|
| Create   | `lib/db/envHealthData.js`                                            | Job CRUD + `computeEnvHealthReport` aggregation   |
| Create   | `lib/__tests__/db/envHealthData.test.js`                             | Unit tests for all DB functions                   |
| Create   | `app/api/reports/env-health/route.js`                                | POST — create job, fire `after()`                 |
| Create   | `app/api/reports/env-health/__tests__/route.test.js`                 | Route test for POST                               |
| Create   | `app/api/reports/env-health/[jobId]/route.js`                        | GET — poll job status                             |
| Create   | `app/api/reports/env-health/[jobId]/__tests__/route.test.js`         | Route test for GET                                |
| Create   | `lib/api/envHealth.js`                                               | Client-side API helpers (no tests needed)         |
| Create   | `app/(app)/reports/EnvHealthReport.jsx`                              | Button + inline report component                  |
| Modify   | `app/(app)/reports/ReportsClient.jsx`                                | Import + render `<EnvHealthReport />`             |

---

## Task 1 — DB layer: `lib/db/envHealthData.js`

**Files:**
- Create: `lib/db/envHealthData.js`
- Create: `lib/__tests__/db/envHealthData.test.js`

- [ ] **Step 1.1 — Write failing tests**

Create `lib/__tests__/db/envHealthData.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, collections, reset } = createMockDb();

vi.mock('@/lib/db/util', () => ({
  toClientDoc: (doc) => ({ ...doc, _id: String(doc._id) }),
}));

// Lazily import after mocks are in place
let createEnvHealthJob, setJobProcessing, setJobCompleted, setJobFailed,
    getEnvHealthJob, computeEnvHealthReport;

beforeEach(async () => {
  reset();
  vi.resetModules();
  ({
    createEnvHealthJob, setJobProcessing, setJobCompleted, setJobFailed,
    getEnvHealthJob, computeEnvHealthReport,
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
    await expect(createEnvHealthJob(db, '', 'Alice')).rejects.toThrow('teamId required');
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
    const raw = { _id: { toString: () => 'job1' }, teamId: 't1', status: 'completed' };
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
    await expect(getEnvHealthJob(db, 't1', 'not-valid')).rejects.toMatchObject({ status: 404 });
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
          project: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    };
    const result = await computeEnvHealthReport(db, 't1');
    expect(result).toEqual({ releases: [], environments: [], matrix: [], trend: [] });
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
      { _id: { releaseId: 'r1', environment: 'QA' }, total: 10, passed: 8, failed: 1, pending: 1 },
      { _id: { releaseId: 'r1', environment: 'Production' }, total: 10, passed: 10, failed: 0, pending: 0 },
    ];
    collections.testResults = {
      aggregate: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(mockAgg) }),
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
```

- [ ] **Step 1.2 — Run tests to confirm they fail**

```bash
cd /Users/Maria/Downloads/regression-hub
npx vitest run lib/__tests__/db/envHealthData.test.js
```

Expected: all tests fail with "Cannot find module '@/lib/db/envHealthData'".

- [ ] **Step 1.3 — Implement `lib/db/envHealthData.js`**

```js
import { ObjectId } from 'mongodb';
import { STATUS } from '@/lib/constants';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

const COLLECTION = 'envHealthJobs';

// ── Job lifecycle helpers ────────────────────────────────────────────────────

export async function createEnvHealthJob(db, teamId, createdBy) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const now = new Date();
  const { insertedId } = await db.collection(COLLECTION).insertOne({
    teamId,
    status: 'queued',
    result: null,
    error: null,
    createdBy: createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

export async function setJobProcessing(db, jobId) {
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { status: 'processing', updatedAt: new Date() } },
  );
}

export async function setJobCompleted(db, jobId, result) {
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { status: 'completed', result, updatedAt: new Date() } },
  );
}

export async function setJobFailed(db, jobId, error) {
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(jobId) },
    { $set: { status: 'failed', error: String(error), updatedAt: new Date() } },
  );
}

export async function getEnvHealthJob(db, teamId, jobId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!jobId || !ObjectId.isValid(jobId)) throw new ApiError(404, 'Job not found');
  const doc = await db
    .collection(COLLECTION)
    .findOne({ _id: new ObjectId(jobId), teamId });
  if (!doc) throw new ApiError(404, 'Job not found');
  return toClientDoc(doc);
}

// ── Heavy computation ────────────────────────────────────────────────────────

/**
 * Aggregates pass/fail/pending counts for every (release × environment) combo
 * in one pipeline, then builds:
 *  - `matrix`  — per-environment rows, each listing every release's pass rate.
 *  - `trend`   — per-release rows sorted oldest-first, each listing per-env
 *                pass rates and an overall rate across all environments.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @returns {Promise<{ releases: object[], environments: string[], matrix: object[], trend: object[] }>}
 */
export async function computeEnvHealthReport(db, teamId) {
  const releases = await db
    .collection('releases')
    .find({ teamId })
    .sort({ createdAt: 1 })
    .project({ _id: 1, name: 1, environments: 1, archived: 1, createdAt: 1 })
    .toArray();

  if (releases.length === 0) {
    return { releases: [], environments: [], matrix: [], trend: [] };
  }

  const releaseIds = releases.map((r) => r._id.toString());

  const resultAgg = await db
    .collection('testResults')
    .aggregate([
      { $match: { teamId, releaseId: { $in: releaseIds } } },
      {
        $group: {
          _id: { releaseId: '$releaseId', environment: '$environment' },
          total: { $sum: 1 },
          passed: { $sum: { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ['$status', STATUS.PENDING] }, 1, 0] } },
        },
      },
    ])
    .toArray();

  // Build lookup: `${releaseId}::${environment}` → summary
  const summaryMap = new Map();
  for (const row of resultAgg) {
    const key = `${row._id.releaseId}::${row._id.environment}`;
    const { total, passed, failed, pending } = row;
    summaryMap.set(key, {
      total,
      passed,
      failed,
      pending,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    });
  }

  // Collect all unique environments across every release, sorted
  const envSet = new Set();
  for (const release of releases) {
    for (const env of release.environments ?? []) envSet.add(env);
  }
  const environments = [...envSet].sort();

  const releasesSummary = releases.map((r) => ({
    _id: r._id.toString(),
    name: r.name,
    archived: r.archived ?? false,
  }));

  // Matrix: one row per environment, columns = releases
  const matrix = environments.map((env) => ({
    environment: env,
    releases: releases.map((release) => {
      const key = `${release._id.toString()}::${env}`;
      const s = summaryMap.get(key) ?? null;
      return {
        releaseId: release._id.toString(),
        releaseName: release.name,
        archived: release.archived ?? false,
        hasData: s !== null,
        total: s?.total ?? 0,
        passed: s?.passed ?? 0,
        failed: s?.failed ?? 0,
        pending: s?.pending ?? 0,
        passRate: s?.passRate ?? 0,
      };
    }),
  }));

  // Trend: one row per release (oldest first), per-env pass rate + overall
  const trend = releases.map((release) => {
    const envRates = {};
    let totalAll = 0;
    let passedAll = 0;
    for (const env of environments) {
      const key = `${release._id.toString()}::${env}`;
      const s = summaryMap.get(key);
      envRates[env] = s ? s.passRate : null;
      if (s) {
        totalAll += s.total;
        passedAll += s.passed;
      }
    }
    return {
      releaseId: release._id.toString(),
      releaseName: release.name,
      archived: release.archived ?? false,
      createdAt:
        release.createdAt instanceof Date
          ? release.createdAt.toISOString()
          : (release.createdAt ?? null),
      environments: envRates,
      overall: totalAll > 0 ? Math.round((passedAll / totalAll) * 100) : null,
    };
  });

  return { releases: releasesSummary, environments, matrix, trend };
}
```

- [ ] **Step 1.4 — Run tests to confirm they pass**

```bash
npx vitest run lib/__tests__/db/envHealthData.test.js
```

Expected: all 10 tests pass.

- [ ] **Step 1.5 — Commit**

```bash
git add lib/db/envHealthData.js lib/__tests__/db/envHealthData.test.js
git commit -m "RXR-XXXX: Add envHealthData DB layer — job lifecycle and report aggregation"
```

---

## Task 2 — POST API route: create job

**Files:**
- Create: `app/api/reports/env-health/route.js`
- Create: `app/api/reports/env-health/__tests__/route.test.js`

- [ ] **Step 2.1 — Write failing test**

Create `app/api/reports/env-health/__tests__/route.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();

const { createEnvHealthJob, setJobCompleted, setJobFailed, setJobProcessing,
        computeEnvHealthReport } = vi.hoisted(() => ({
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

vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn().mockResolvedValue(db) }));

import { POST } from '../route';

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('POST /api/reports/env-health', () => {
  it('returns 202 with the jobId', async () => {
    createEnvHealthJob.mockResolvedValue('job123');
    afterFn.mockImplementation(() => {});

    const res = await POST(new Request('http://localhost/api/reports/env-health', {
      method: 'POST',
    }), {});

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe('job123');
  });

  it('registers an after() callback', async () => {
    createEnvHealthJob.mockResolvedValue('job456');
    afterFn.mockImplementation(() => {});

    await POST(new Request('http://localhost/api/reports/env-health', {
      method: 'POST',
    }), {});

    expect(afterFn).toHaveBeenCalledOnce();
    expect(typeof afterFn.mock.calls[0][0]).toBe('function');
  });
});
```

- [ ] **Step 2.2 — Run test to confirm it fails**

```bash
npx vitest run "app/api/reports/env-health/__tests__/route.test.js"
```

Expected: fails — `Cannot find module '../route'`.

- [ ] **Step 2.3 — Implement the POST route**

Create `app/api/reports/env-health/route.js`:

```js
import { after } from 'next/server';
import { NextResponse } from 'next/server';
import {
  computeEnvHealthReport,
  createEnvHealthJob,
  setJobCompleted,
  setJobFailed,
  setJobProcessing,
} from '@/lib/db/envHealthData';
import { getDb } from '@/lib/mongodb';
import { withTeam } from '@/lib/server/withTeam';

export const POST = withTeam(async (_request, _ctx, { teamId, db, session }) => {
  const jobId = await createEnvHealthJob(
    db,
    teamId,
    session.user?.name ?? session.user?.email ?? null,
  );

  after(async () => {
    const bgDb = await getDb();
    try {
      await setJobProcessing(bgDb, jobId);
      const result = await computeEnvHealthReport(bgDb, teamId);
      await setJobCompleted(bgDb, jobId, result);
    } catch (err) {
      await setJobFailed(bgDb, jobId, err?.message ?? 'Unknown error').catch(() => {});
    }
  });

  return NextResponse.json({ jobId }, { status: 202 });
});
```

- [ ] **Step 2.4 — Run tests to confirm they pass**

```bash
npx vitest run "app/api/reports/env-health/__tests__/route.test.js"
```

Expected: both tests pass.

- [ ] **Step 2.5 — Commit**

```bash
git add app/api/reports/env-health/route.js app/api/reports/env-health/__tests__/route.test.js
git commit -m "RXR-XXXX: Add POST /api/reports/env-health — create background job"
```

---

## Task 3 — GET poll route: job status

**Files:**
- Create: `app/api/reports/env-health/[jobId]/route.js`
- Create: `app/api/reports/env-health/[jobId]/__tests__/route.test.js`

- [ ] **Step 3.1 — Write failing test**

Create `app/api/reports/env-health/[jobId]/__tests__/route.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();

const { getEnvHealthJob } = vi.hoisted(() => ({ getEnvHealthJob: vi.fn() }));

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, { session: { user: { teamId: 't1' } }, teamId: 't1', db });
    } catch (err) {
      if (err?.name === 'ApiError') {
        const { NextResponse } = await import('next/server');
        return NextResponse.json({ error: err.message }, { status: err.status });
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
    getEnvHealthJob.mockResolvedValue({ _id: 'job1', status: 'processing', result: null });
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
  });
});
```

- [ ] **Step 3.2 — Run test to confirm it fails**

```bash
npx vitest run "app/api/reports/env-health/\[jobId\]/__tests__/route.test.js"
```

Expected: fails — `Cannot find module '../route'`.

- [ ] **Step 3.3 — Implement the GET route**

Create `app/api/reports/env-health/[jobId]/route.js`:

```js
import { NextResponse } from 'next/server';
import { getEnvHealthJob } from '@/lib/db/envHealthData';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_request, context, { teamId, db }) => {
  const { jobId } = await context.params;
  const job = await getEnvHealthJob(db, teamId, jobId);
  return NextResponse.json(job);
});
```

- [ ] **Step 3.4 — Run tests to confirm they pass**

```bash
npx vitest run "app/api/reports/env-health/\[jobId\]/__tests__/route.test.js"
```

Expected: both tests pass.

- [ ] **Step 3.5 — Commit**

```bash
git add "app/api/reports/env-health/[jobId]/route.js" "app/api/reports/env-health/[jobId]/__tests__/route.test.js"
git commit -m "RXR-XXXX: Add GET /api/reports/env-health/[jobId] — poll job status"
```

---

## Task 4 — Client API helpers: `lib/api/envHealth.js`

**Files:**
- Create: `lib/api/envHealth.js`

(No tests — thin HTTP wrappers. Schema validation is the test.)

- [ ] **Step 4.1 — Create `lib/api/envHealth.js`**

```js
import { z } from 'zod';
import { get, post } from '@/lib/http/client';

const jobSchema = z.object({
  _id: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  result: z.any().nullable().optional(),
  error: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function createEnvHealthJob() {
  return post('/api/reports/env-health', {});
}

export function pollEnvHealthJob(jobId) {
  return get(`/api/reports/env-health/${jobId}`, { schema: jobSchema });
}
```

- [ ] **Step 4.2 — Commit**

```bash
git add lib/api/envHealth.js
git commit -m "RXR-XXXX: Add client API helpers for env-health job"
```

---

## Task 5 — `EnvHealthReport` component

**Files:**
- Create: `app/(app)/reports/EnvHealthReport.jsx`

- [ ] **Step 5.1 — Implement the component**

```jsx
'use client';

import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@/components/Toast';
import { createEnvHealthJob, pollEnvHealthJob } from '@/lib/api/envHealth';

const POLL_INTERVAL_MS = 3000;

function passRateColor(rate) {
  if (rate === null) return 'text.disabled';
  if (rate >= 80) return 'pass.main';
  if (rate >= 50) return 'warning.main';
  return 'error.main';
}

function PassRateCell({ rate, total }) {
  if (!total) {
    return (
      <Typography variant='tableCell' color='text.disabled'>
        —
      </Typography>
    );
  }
  return (
    <Typography variant='tableCell' sx={{ fontWeight: 600, color: passRateColor(rate) }}>
      {rate}%
    </Typography>
  );
}

function ReportMatrix({ matrix, releases }) {
  if (!matrix?.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant='panelTitle'>Environment Health Matrix</Typography>
      <Typography variant='tableCell' color='text.secondary'>
        Pass rate per environment across all releases.
      </Typography>
      <TableContainer component={Paper} variant='outlined'>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Environment</TableCell>
              {releases.map((r) => (
                <TableCell key={r._id} align='center' sx={{ fontWeight: 700 }}>
                  <Stack spacing={0.25} sx={{ alignItems: 'center' }}>
                    <span>{r.name}</span>
                    {r.archived && (
                      <Chip label='archived' size='small' sx={{ fontSize: 9, height: 16 }} />
                    )}
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {matrix.map((row) => (
              <TableRow key={row.environment} sx={{ '&:last-child td': { border: 0 } }}>
                <TableCell>
                  <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
                    {row.environment}
                  </Typography>
                </TableCell>
                {row.releases.map((rel) => (
                  <TableCell key={rel.releaseId} align='center'>
                    <PassRateCell rate={rel.passRate} total={rel.total} />
                    {rel.hasData && (
                      <Typography variant='tableCell' color='text.disabled' sx={{ fontSize: 10 }}>
                        {rel.passed}/{rel.total}
                      </Typography>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function ReleaseTrend({ trend, environments }) {
  if (!trend?.length) return null;
  return (
    <Stack spacing={1}>
      <Typography variant='panelTitle'>Release Trend</Typography>
      <Typography variant='tableCell' color='text.secondary'>
        Overall pass rate per release over time (oldest → newest).
      </Typography>
      <TableContainer component={Paper} variant='outlined'>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Release</TableCell>
              <TableCell align='center' sx={{ fontWeight: 700 }}>Overall</TableCell>
              {environments.map((env) => (
                <TableCell key={env} align='center' sx={{ fontWeight: 700 }}>
                  {env}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {trend.map((row) => (
              <TableRow key={row.releaseId} sx={{ '&:last-child td': { border: 0 } }}>
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant='tableCell' sx={{ fontWeight: 600 }}>
                      {row.releaseName}
                    </Typography>
                    {row.archived && (
                      <Chip label='archived' size='small' sx={{ fontSize: 9, height: 16 }} />
                    )}
                  </Stack>
                </TableCell>
                <TableCell align='center'>
                  <PassRateCell rate={row.overall} total={row.overall !== null ? 1 : 0} />
                </TableCell>
                {environments.map((env) => (
                  <TableCell key={env} align='center'>
                    <PassRateCell rate={row.environments[env]} total={row.environments[env] !== null ? 1 : 0} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

/**
 * Env Health & Release Trend report section.
 * Renders a "Generate" button. On click, fires a background job via POST
 * /api/reports/env-health and polls until completed or failed.
 */
export default function EnvHealthReport() {
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // queued | processing | completed | failed
  const [reportData, setReportData] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const pollRef = useRef(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (id) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const job = await pollEnvHealthJob(id);
          setJobStatus(job.status);
          if (job.status === 'completed') {
            stopPolling();
            setReportData(job.result);
          } else if (job.status === 'failed') {
            stopPolling();
            setErrorMsg(job.error ?? 'Report generation failed.');
            showToast('Report generation failed', 'error');
          }
        } catch {
          stopPolling();
          setJobStatus('failed');
          setErrorMsg('Could not reach the server while polling.');
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  async function handleGenerate() {
    setJobId(null);
    setJobStatus(null);
    setReportData(null);
    setErrorMsg(null);
    try {
      const { jobId: id } = await createEnvHealthJob();
      setJobId(id);
      setJobStatus('queued');
      startPolling(id);
    } catch {
      setJobStatus('failed');
      setErrorMsg('Could not start report generation.');
    }
  }

  const isRunning = jobStatus === 'queued' || jobStatus === 'processing';

  return (
    <Paper
      variant='outlined'
      sx={{
        p: 3,
        borderLeftWidth: 4,
        borderLeftColor: jobStatus === 'completed' ? 'pass.main' : 'primary.main',
      }}
    >
      <Stack spacing={2}>
        {/* Header row */}
        <Stack
          direction='row'
          spacing={2}
          sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <Stack spacing={0.5}>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
              <AssessmentOutlinedIcon sx={{ color: 'primary.main' }} />
              <Typography variant='panelTitle' component='h2'>
                Environment Health &amp; Release Trend
              </Typography>
            </Stack>
            <Typography variant='tableCell' color='text.secondary'>
              Aggregates pass/fail/pending data across all releases and
              environments. Runs as a background job — you can continue working
              while it processes.
            </Typography>
          </Stack>

          <Button
            variant={jobStatus === 'completed' ? 'outlined' : 'contained'}
            size='small'
            startIcon={
              isRunning ? (
                <CircularProgress size={14} color='inherit' />
              ) : jobStatus === 'completed' ? (
                <RefreshIcon />
              ) : (
                <AssessmentOutlinedIcon />
              )
            }
            onClick={handleGenerate}
            disabled={isRunning}
            sx={{ flexShrink: 0 }}
          >
            {isRunning
              ? jobStatus === 'queued'
                ? 'Queued…'
                : 'Processing…'
              : jobStatus === 'completed'
                ? 'Regenerate'
                : 'Generate Report'}
          </Button>
        </Stack>

        {/* Status feedback */}
        {jobStatus === 'queued' && (
          <Alert severity='info' icon={<CircularProgress size={16} />}>
            Report queued — waiting for processing to start…
          </Alert>
        )}
        {jobStatus === 'processing' && (
          <Alert severity='info' icon={<CircularProgress size={16} />}>
            Running aggregations across all releases and environments…
          </Alert>
        )}
        {jobStatus === 'failed' && (
          <Alert severity='error' icon={<ErrorOutlineIcon />}>
            {errorMsg ?? 'Report generation failed. Try again.'}
          </Alert>
        )}

        {/* Report output */}
        {jobStatus === 'completed' && reportData && (
          <Stack spacing={3}>
            <Divider />
            <ReportMatrix
              matrix={reportData.matrix}
              releases={reportData.releases}
            />
            <ReleaseTrend
              trend={reportData.trend}
              environments={reportData.environments}
            />
            {!reportData.matrix?.length && (
              <Typography variant='tableCell' color='text.secondary'>
                No test result data found. Run some tests first.
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 5.2 — Commit**

```bash
git add app/\(app\)/reports/EnvHealthReport.jsx
git commit -m "RXR-XXXX: Add EnvHealthReport inline component with job states"
```

---

## Task 6 — Wire into ReportsClient

**Files:**
- Modify: `app/(app)/reports/ReportsClient.jsx`

The existing page renders a `<PageHeader>` then release-grouped `Panel` sections. Add `<EnvHealthReport />` as a new card section between the `<PageHeader>` and the existing per-release panels. Add a labelled divider between the two sections.

- [ ] **Step 6.1 — Add import at top of ReportsClient.jsx**

In `app/(app)/reports/ReportsClient.jsx`, add after the existing imports (before `export function buildReportRows`):

```jsx
import EnvHealthReport from './EnvHealthReport';
```

- [ ] **Step 6.2 — Add the section inside the returned JSX**

In `ReportsClient`, find the `return (` block. The current structure is:

```jsx
return (
  <Stack spacing={4}>
    <PageHeader ... />
    ... release panels ...
  </Stack>
);
```

Add the `EnvHealthReport` section and a divider between the page header and the existing panels. Replace the opening of that `Stack` so it looks like:

```jsx
return (
  <Stack spacing={4}>
    <PageHeader
      eyebrow='Reports'
      title='Reports'
      sub='Generate PDF signoff reports and Excel exports, or run the environment health analysis.'
    />

    <EnvHealthReport />

    <Divider />

    {/* existing per-release panels below this line — unchanged */}
    ...
  </Stack>
);
```

> Note: find the exact `PageHeader` call in the file and insert `<EnvHealthReport />` and `<Divider />` directly after its closing `/>`, before the next sibling JSX element (the releases section). `Divider` is already imported from `@mui/material`.

- [ ] **Step 6.3 — Run full test suite to verify nothing broken**

```bash
npx vitest run
```

Expected: all existing tests still pass; new route + DB tests pass.

- [ ] **Step 6.4 — Commit**

```bash
git add app/\(app\)/reports/ReportsClient.jsx
git commit -m "RXR-XXXX: Wire EnvHealthReport into Reports page above per-release panels"
```

---

## Self-Review

### Spec coverage check

| AC requirement | Task that covers it |
|---|---|
| Button to generate env health + trend report | Task 5 — `EnvHealthReport` button |
| Summarises environment health using execution/defect/status/release data | Task 1 — `computeEnvHealthReport` aggregates pass/fail/pending per env×release |
| Shows release trend across versions | Task 1 — `trend[]` array; Task 5 — `ReleaseTrend` table |
| Heavy work is non-blocking (background job) | Task 2 — `after()` pattern |
| Clear queued / processing / completed / failed states | Task 5 — four distinct UI states with Alert + spinner |
| Output linked to release/environment context | Data carries `releaseId`, `releaseName`, `environment` fields throughout |
| Placed where it makes most sense (reports vs releases) | Reports — cross-release aggregate; wired in Task 6 |
| "Button proper — when clicked then appears" | Task 5 — inline expansion within the same Paper on click |

### Placeholder scan — none found. Every step has actual code.

### Type consistency check

- `jobId` is a string throughout (returned by `createEnvHealthJob`, used in `setJobProcessing`/`setJobCompleted`/`setJobFailed`/`getEnvHealthJob`, passed from POST route to `after()` closure, returned in API response body as `{ jobId }`, consumed by `pollEnvHealthJob(jobId)` in client).
- `result` field shape returned by `computeEnvHealthReport`: `{ releases, environments, matrix, trend }` — same shape rendered by `ReportMatrix` and `ReleaseTrend`.
- `passRate` is always `0–100` (integer percent). `PassRateCell` renders it as `${rate}%`.
- `environments` is `string[]` in both `computeEnvHealthReport` return and `ReleaseTrend` props — consistent.
