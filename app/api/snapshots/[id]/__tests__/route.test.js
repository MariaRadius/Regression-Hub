import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';

/**
 * @see {@link app/api/snapshots/[id]/download/route.js}
 */

const { db, reset } = createMockDb();

const { getSnapshotFile } = vi.hoisted(() => ({
  getSnapshotFile: vi.fn(),
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

vi.mock('@/lib/db/reportSnapshotsData', () => ({ getSnapshotFile }));

import { GET } from '../download/route';

const PARAMS = { params: Promise.resolve({ id: 'snap-1' }) };

beforeEach(() => {
  reset();
  vi.clearAllMocks();
});

describe('GET /api/snapshots/[id]/download', () => {
  it('streams PDF bytes with correct headers on success', async () => {
    const pdfBytes = Buffer.from('PDF-BYTES');
    getSnapshotFile.mockResolvedValue({
      stream: Readable.from(pdfBytes),
      filename: 'r.pdf',
      byteSize: 9,
      contentType: 'application/pdf',
    });

    const res = await GET(
      new Request('http://x/api/snapshots/snap-1/download'),
      PARAMS,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain(
      'filename="r.pdf"',
    );
    expect(res.headers.get('Content-Length')).toBe('9');
  });

  it('returns the correct PDF bytes in the body', async () => {
    const pdfBytes = Buffer.from('PDF-BYTES');
    getSnapshotFile.mockResolvedValue({
      stream: Readable.from(pdfBytes),
      filename: 'r.pdf',
      byteSize: 9,
      contentType: 'application/pdf',
    });

    const res = await GET(
      new Request('http://x/api/snapshots/snap-1/download'),
      PARAMS,
    );

    const body = await res.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('PDF-BYTES');
  });

  it('returns 404 when snapshot is not found', async () => {
    const { ApiError } = await import('@/lib/errors');
    getSnapshotFile.mockRejectedValue(new ApiError(404, 'Snapshot not found'));

    const res = await GET(
      new Request('http://x/api/snapshots/snap-1/download'),
      PARAMS,
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Snapshot not found' });
  });

  it('calls getSnapshotFile with (db, teamId, id)', async () => {
    const pdfBytes = Buffer.from('BYTES');
    getSnapshotFile.mockResolvedValue({
      stream: Readable.from(pdfBytes),
      filename: 'test.pdf',
      byteSize: 5,
      contentType: 'application/pdf',
    });

    await GET(new Request('http://x/api/snapshots/snap-1/download'), PARAMS);

    expect(getSnapshotFile).toHaveBeenCalledWith(db, 't1', 'snap-1');
  });
});
