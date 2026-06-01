import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

const { db, reset } = createMockDb();
const { analyseImport, commitImport } = vi.hoisted(() => ({
  analyseImport: vi.fn(),
  commitImport: vi.fn(),
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
vi.mock('@/lib/db/importExcelData', () => ({ analyseImport, commitImport }));

import { POST } from '../route';

const RELEASE_ID = '6642f000000000000000001a';
const PARAMS = { params: Promise.resolve({ id: RELEASE_ID }) };

function makeRow(overrides = {}) {
  return {
    applicationName: 'Login App',
    moduleName: 'Auth',
    type: '',
    traceability: '',
    testKey: '',
    testCase: 'Login with valid credentials',
    preconditions: '',
    steps: '',
    expectedResult: 'User reaches dashboard',
    notes: '',
    status: '',
    testedBy: '',
    testedOn: '',
    fingerprint: 'login-with-valid-credentials',
    ...overrides,
  };
}

function makeRequest(body) {
  return { json: async () => body };
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Phase 1 (analyse)
// ---------------------------------------------------------------------------

describe('POST /api/releases/[id]/import — Phase 1 (analyse)', () => {
  it('returns analysis preview when confirmed is absent', async () => {
    analyseImport.mockResolvedValue({
      valid: true,
      createCount: 3,
      updateCount: 1,
      rows: [],
      errors: [],
      warnings: [],
    });
    const res = await POST(makeRequest({ rows: [makeRow()] }), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ valid: true, createCount: 3 });
    expect(analyseImport).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        releaseId: RELEASE_ID,
        rows: expect.any(Array),
      }),
    );
    expect(commitImport).not.toHaveBeenCalled();
  });

  it('returns analysis preview when confirmed is false', async () => {
    analyseImport.mockResolvedValue({
      valid: true,
      createCount: 2,
      updateCount: 0,
      rows: [],
      errors: [],
      warnings: [],
    });
    const res = await POST(
      makeRequest({ rows: [makeRow()], confirmed: false }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(analyseImport).toHaveBeenCalled();
    expect(commitImport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 2 (commit)
// ---------------------------------------------------------------------------

describe('POST /api/releases/[id]/import — Phase 2 (commit)', () => {
  it('commits import and revalidates paths', async () => {
    const { revalidatePath } = await import('next/cache');
    commitImport.mockResolvedValue({
      imported: 4,
      updated: 1,
      releaseId: RELEASE_ID,
    });
    const res = await POST(
      makeRequest({ rows: [makeRow()], confirmed: true, environment: 'QA' }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      imported: 4,
      updated: 1,
      releaseId: RELEASE_ID,
    });
    expect(commitImport).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        releaseId: RELEASE_ID,
        environment: 'QA',
        rows: expect.any(Array),
        appInitialOverrides: {},
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/(app)/releases', 'page');
  });

  it('returns 400 when confirmed is true but environment is missing', async () => {
    const res = await POST(
      makeRequest({ rows: [makeRow()], confirmed: true, environment: '' }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('environment is required when confirmed is true');
    expect(commitImport).not.toHaveBeenCalled();
  });

  it('passes appInitialOverrides to commitImport', async () => {
    commitImport.mockResolvedValue({
      imported: 1,
      updated: 0,
      releaseId: RELEASE_ID,
    });
    const res = await POST(
      makeRequest({
        rows: [makeRow({ applicationName: 'My App' })],
        confirmed: true,
        environment: 'QA',
        appInitialOverrides: { 'My App': 'MYA' },
      }),
      PARAMS,
    );
    expect(res.status).toBe(200);
    expect(commitImport).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({ appInitialOverrides: { 'My App': 'MYA' } }),
    );
  });
});

// ---------------------------------------------------------------------------
// Server process-safety FLOOR tests
// ---------------------------------------------------------------------------

describe('POST /api/releases/[id]/import — server floor', () => {
  it('returns 400 for non-JSON body', async () => {
    const req = {
      json: async () => {
        throw new SyntaxError('bad json');
      },
    };
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid JSON/);
  });

  it('returns 400 when body is schema-malformed (missing rows field)', async () => {
    const res = await POST(makeRequest({ confirmed: false }), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('returns 400 when rows exceeds the row-count cap', async () => {
    const rows = Array.from({ length: 10_001 }, (_, i) =>
      makeRow({ testCase: `Case ${i}`, fingerprint: `case-${i}` }),
    );
    const res = await POST(makeRequest({ rows }), PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds the/);
  });

  it('returns 400 when a field in a row exceeds the field-length cap', async () => {
    const longField = 'x'.repeat(20_001);
    const res = await POST(
      makeRequest({ rows: [makeRow({ testCase: longField })] }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceeds the/);
  });

  it('returns 400 for a degenerate app name (deriveInitial throw-guard), not 500', async () => {
    // Application name with no alphanumeric characters → deriveInitial throws.
    const res = await POST(
      makeRequest({
        rows: [
          makeRow({
            applicationName: '---',
            fingerprint: 'login-with-valid-credentials',
          }),
        ],
      }),
      PARAMS,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/has no alphanumeric characters/);
    // Must never have reached analyseImport
    expect(analyseImport).not.toHaveBeenCalled();
  });

  it('returns 400 when rows is not an array', async () => {
    const res = await POST(makeRequest({ rows: 'not-an-array' }), PARAMS);
    expect(res.status).toBe(400);
  });
});
