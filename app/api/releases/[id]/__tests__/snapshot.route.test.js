import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

/**
 * Tests for POST /api/releases/[id]/snapshot
 *
 * @see {@link app/api/releases/[id]/snapshot/route.js}
 */

const { db, reset } = createMockDb();

const { getRelease } = vi.hoisted(() => ({
  getRelease: vi.fn(),
}));

const { saveSnapshot } = vi.hoisted(() => ({
  saveSnapshot: vi.fn(),
}));

// Mutable session ref so individual tests can override the injected user.
const sessionRef = {
  user: { id: 'u1', teamId: 't1', role: 'admin', name: 'Alice' },
};

vi.mock('@/lib/server/withTeam', () => {
  const wrap = (handler) => async (req, ctx) => {
    try {
      return await handler(req, ctx, {
        session: sessionRef,
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

vi.mock('@/lib/db/releasesData', () => ({ getRelease }));
vi.mock('@/lib/db/reportSnapshotsData', () => ({ saveSnapshot }));

import { POST } from '../snapshot/route';

const PARAMS = { params: Promise.resolve({ id: 'rel-1' }) };

/**
 * Builds a minimal fake request with a multipart-like formData() accessor.
 * Using a real FormData/File in vitest/jsdom is unreliable, so we supply a
 * hand-crafted fake that exposes exactly what the handler reads.
 *
 * @param {{ environment?: string, filename?: string, file?: object | null }} overrides
 */
function buildRequest({
  environment = 'QA',
  filename = 'r.pdf',
  file = undefined,
} = {}) {
  const pdfBuffer = Buffer.from('PDF');
  const defaultFile = {
    arrayBuffer: async () => {
      const ab = new ArrayBuffer(pdfBuffer.length);
      const view = new Uint8Array(ab);
      for (let i = 0; i < pdfBuffer.length; i++) view[i] = pdfBuffer[i];
      return ab;
    },
    name: 'r.pdf',
  };
  const map = {
    environment,
    filename,
    file: file !== undefined ? file : defaultFile,
  };
  return {
    formData: async () => ({
      get: (k) => (k in map ? map[k] : null),
    }),
  };
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  // Reset session to default Alice user before each test.
  sessionRef.user = { id: 'u1', teamId: 't1', role: 'admin', name: 'Alice' };
  getRelease.mockResolvedValue({
    _id: 'rel-1',
    name: '2.5',
    environments: ['QA'],
  });
});

describe('POST /api/releases/[id]/snapshot', () => {
  it('returns 200 and metadata when multipart is valid', async () => {
    const meta = {
      _id: 'snap-1',
      releaseId: 'rel-1',
      releaseName: '2.5',
      environment: 'QA',
      generatedBy: 'Alice',
      filename: 'r.pdf',
      byteSize: 3,
      generatedAt: '2026-06-01T00:00:00.000Z',
    };
    saveSnapshot.mockResolvedValue(meta);

    const res = await POST(buildRequest(), PARAMS);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      _id: 'snap-1',
      releaseName: '2.5',
    });
  });

  it('calls saveSnapshot with the correct arguments', async () => {
    saveSnapshot.mockResolvedValue({ _id: 'snap-1' });

    await POST(buildRequest(), PARAMS);

    expect(getRelease).toHaveBeenCalledWith(db, 't1', 'rel-1');
    expect(saveSnapshot).toHaveBeenCalledOnce();

    const [callDb, callTeamId, callOpts] = saveSnapshot.mock.calls[0];
    expect(callDb).toBe(db);
    expect(callTeamId).toBe('t1');
    expect(callOpts.releaseId).toBe('rel-1');
    expect(callOpts.releaseName).toBe('2.5');
    expect(callOpts.environment).toBe('QA');
    expect(callOpts.generatedBy).toBe('Alice');
    expect(Buffer.isBuffer(callOpts.buffer)).toBe(true);
    expect(callOpts.filename).toBe('r.pdf');
  });

  it('uses file.name as filename when filename field is empty', async () => {
    saveSnapshot.mockResolvedValue({ _id: 'snap-2' });

    await POST(buildRequest({ filename: '' }), PARAMS);

    const [, , callOpts] = saveSnapshot.mock.calls[0];
    expect(callOpts.filename).toBe('r.pdf');
  });

  it('uses session.user.email as generatedBy when name is absent', async () => {
    // Override the mutable session ref for this test only.
    sessionRef.user = {
      id: 'u2',
      teamId: 't1',
      role: 'qa',
      email: 'bob@example.com',
    };
    saveSnapshot.mockResolvedValue({ _id: 'snap-3' });

    await POST(buildRequest(), PARAMS);

    const [, , callOpts] = saveSnapshot.mock.calls[0];
    expect(callOpts.generatedBy).toBe('bob@example.com');
  });

  it('returns 400 when environment is missing', async () => {
    const res = await POST(buildRequest({ environment: '' }), PARAMS);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'environment required' });
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it('returns 400 when environment is whitespace only', async () => {
    const res = await POST(buildRequest({ environment: '   ' }), PARAMS);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'environment required' });
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it('returns 400 when file is null', async () => {
    const res = await POST(buildRequest({ file: null }), PARAMS);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'No file uploaded' });
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it('returns 400 when file has no arrayBuffer method', async () => {
    const res = await POST(buildRequest({ file: { name: 'r.pdf' } }), PARAMS);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'No file uploaded' });
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it('surfaces 404 from getRelease and does not call saveSnapshot', async () => {
    const { ApiError } = await import('@/lib/errors');
    getRelease.mockRejectedValue(new ApiError(404, 'Release not found'));

    const res = await POST(buildRequest(), PARAMS);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'Release not found' });
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
