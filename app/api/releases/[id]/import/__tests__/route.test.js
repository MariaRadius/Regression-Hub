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

function makeFormData({
  fileName = 'cases.xlsx',
  mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  confirmed = 'false',
  environment = '',
  appInitialOverrides = null,
} = {}) {
  const mockFile = {
    arrayBuffer: async () => Buffer.from('xlsx-bytes').buffer,
    name: fileName,
    type: mimeType,
  };
  const fields = {
    file: mockFile,
    confirmed,
    environment,
    ...(appInitialOverrides !== null
      ? { appInitialOverrides: JSON.stringify(appInitialOverrides) }
      : {}),
  };
  return async () => ({ get: (k) => fields[k] ?? null });
}

function makeRequest(formDataFields) {
  return { formData: makeFormData(formDataFields) };
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('POST /api/releases/[id]/import — Phase 1 (analyse)', () => {
  it('returns analysis preview when confirmed is false', async () => {
    analyseImport.mockResolvedValue({
      valid: true,
      creates: 3,
      updates: 1,
      rows: [],
    });
    const res = await POST(makeRequest(), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ valid: true, creates: 3 });
    expect(analyseImport).toHaveBeenCalledWith(
      db,
      't1',
      expect.objectContaining({
        releaseId: RELEASE_ID,
        buffer: expect.any(Buffer),
      }),
    );
    expect(commitImport).not.toHaveBeenCalled();
  });

  it('returns 400 when no file is provided', async () => {
    const req = {
      formData: async () => ({ get: (k) => (k === 'file' ? null : 'false') }),
    };
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('No file uploaded');
  });

  it('returns 400 for invalid file type', async () => {
    const res = await POST(
      makeRequest({ mimeType: 'text/plain', fileName: 'bad.txt' }),
      PARAMS,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/releases/[id]/import — Phase 2 (commit)', () => {
  it('commits import and revalidates paths', async () => {
    const { revalidatePath } = await import('next/cache');
    commitImport.mockResolvedValue({
      imported: 4,
      updated: 1,
      releaseId: RELEASE_ID,
    });
    const res = await POST(
      makeRequest({ confirmed: 'true', environment: 'QA' }),
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
        buffer: expect.any(Buffer),
        appInitialOverrides: {},
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith('/(app)/releases', 'page');
  });

  it('returns 400 when confirmed is true but environment is missing', async () => {
    const res = await POST(
      makeRequest({ confirmed: 'true', environment: '' }),
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
        confirmed: 'true',
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

  it('returns 400 when appInitialOverrides is invalid JSON', async () => {
    const badReq = {
      formData: async () => ({
        get: (k) => {
          if (k === 'file') {
            return {
              arrayBuffer: async () => Buffer.from('x').buffer,
              name: 'f.xlsx',
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            };
          }
          if (k === 'appInitialOverrides') return 'not-json{{{';
          if (k === 'confirmed') return 'true';
          if (k === 'environment') return 'QA';
          return null;
        },
      }),
    };
    const res = await POST(badReq, PARAMS);
    expect(res.status).toBe(400);
  });
});
