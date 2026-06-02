/**
 * @see {@link lib/db/reportSnapshotsData.js}
 */
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectApiError } from '@/lib/__tests__/helpers/expectApiError';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import {
  getSnapshotFile,
  listSnapshots,
  saveSnapshot,
} from '@/lib/db/reportSnapshotsData';

// ---------------------------------------------------------------------------
// Mock GridFS bucket
// ---------------------------------------------------------------------------

/** Fake writable returned by openUploadStream. Calling end() emits "finish". */
function makeFakeUploadStream() {
  const emitter = new EventEmitter();
  emitter.id = new ObjectId();
  emitter.end = (_buf) => {
    queueMicrotask(() => emitter.emit('finish'));
  };
  return emitter;
}

const mockBucket = {
  openUploadStream: vi.fn(),
  delete: vi.fn(),
  openDownloadStream: vi.fn(),
};

vi.mock('mongodb', async (orig) => {
  const actual = await orig();
  function MockGridFSBucket() {
    return mockBucket;
  }
  return {
    ...actual,
    GridFSBucket: MockGridFSBucket,
  };
});

// ---------------------------------------------------------------------------
// Mock getClient (transaction harness)
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  getClient: vi.fn(async () => ({
    startSession: () => ({
      withTransaction: async (cb) => {
        await cb();
      },
      endSession: vi.fn(),
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Mock eventsData
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/eventsData', () => ({
  appendEvent: vi.fn(),
}));

import { appendEvent } from '@/lib/db/eventsData';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEAM = 't1';
const REL_ID = 'rel-1';
const ENV = 'QA';
const PDF_BUF = Buffer.from('fake-pdf-bytes');

function freshUploadStream() {
  const stream = makeFakeUploadStream();
  mockBucket.openUploadStream.mockReturnValue(stream);
  return stream;
}

const { db, collections, reset } = createMockDb();

beforeEach(() => {
  reset();
  vi.clearAllMocks();

  // Default: no prior snapshot
  collections.reportSnapshots = {
    findOne: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue({ upsertedId: new ObjectId() }),
    find: vi.fn(() => ({
      sort: () => ({ toArray: async () => [] }),
    })),
  };

  mockBucket.delete.mockResolvedValue(undefined);
  mockBucket.openDownloadStream.mockReturnValue(
    Readable.from(Buffer.from('PDF')),
  );
});

// ---------------------------------------------------------------------------
// saveSnapshot
// ---------------------------------------------------------------------------

describe('saveSnapshot', () => {
  it('(a) new combo — updateOne called with upsert:true, appendEvent EXPORT/EXPORT_PDF, no bucket.delete', async () => {
    const stream = freshUploadStream();
    const newFileId = stream.id;

    // No prior snapshot on the first lookup; the read-back returns the upserted doc.
    const savedId = new ObjectId();
    collections.reportSnapshots.findOne = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        _id: savedId,
        teamId: TEAM,
        releaseId: REL_ID,
        releaseName: '2.5',
        environment: ENV,
        fileId: newFileId,
        filename: 'report.pdf',
        byteSize: PDF_BUF.length,
        generatedBy: 'Alice',
        generatedAt: new Date(),
      });

    const result = await saveSnapshot(db, TEAM, {
      releaseId: REL_ID,
      releaseName: '2.5',
      environment: ENV,
      generatedBy: 'Alice',
      buffer: PDF_BUF,
      filename: 'report.pdf',
    });

    // updateOne called with upsert:true
    expect(collections.reportSnapshots.updateOne).toHaveBeenCalledOnce();
    const [filter, update, options] =
      collections.reportSnapshots.updateOne.mock.calls[0];
    expect(filter).toEqual({
      teamId: TEAM,
      releaseId: REL_ID,
      environment: ENV,
    });
    expect(options).toMatchObject({ upsert: true });
    expect(update.$set).toMatchObject({
      teamId: TEAM,
      releaseId: REL_ID,
      releaseName: '2.5',
      environment: ENV,
      fileId: newFileId,
      filename: 'report.pdf',
      byteSize: PDF_BUF.length,
      generatedBy: 'Alice',
    });
    expect(update.$set.generatedAt).toBeInstanceOf(Date);

    // appendEvent called with correct category/action
    expect(appendEvent).toHaveBeenCalledOnce();
    const eventArg = appendEvent.mock.calls[0][2];
    expect(eventArg.category).toBe(AUDIT_CATEGORY.EXPORT);
    expect(eventArg.action).toBe(AUDIT_ACTION.EXPORT_PDF);
    expect(eventArg.releaseId).toBe(REL_ID);
    expect(eventArg.environment).toBe(ENV);
    expect(eventArg.caseId).toBeNull();
    expect(eventArg.by).toBe('Alice');

    // no delete on new combo
    expect(mockBucket.delete).not.toHaveBeenCalled();

    // returns the read-back client doc (real stored _id, not a fabricated one).
    // fileId is an internal GridFS ObjectId — dropped so the doc is a plain,
    // serializable object safe to pass from an RSC to a client component.
    expect(result._id).toBe(String(savedId));
    expect(result.releaseName).toBe('2.5');
    expect(result.fileId).toBeUndefined();
  });

  it('(b) existing combo — bucket.delete(oldId) called for replace, exactly one updateOne', async () => {
    const oldId = new ObjectId();
    collections.reportSnapshots.findOne = vi.fn().mockResolvedValue({
      _id: new ObjectId(),
      teamId: TEAM,
      releaseId: REL_ID,
      environment: ENV,
      fileId: oldId,
      filename: 'old.pdf',
    });

    const _stream = freshUploadStream();

    await saveSnapshot(db, TEAM, {
      releaseId: REL_ID,
      releaseName: '2.5',
      environment: ENV,
      generatedBy: 'Bob',
      buffer: PDF_BUF,
      filename: 'new.pdf',
    });

    // old file deleted
    expect(mockBucket.delete).toHaveBeenCalledWith(oldId);
    // only one upsert
    expect(collections.reportSnapshots.updateOne).toHaveBeenCalledOnce();
  });

  it('(c) teamId "" throws ApiError 400', async () => {
    await expectApiError(
      saveSnapshot(db, '', {
        releaseId: REL_ID,
        environment: ENV,
        buffer: PDF_BUF,
      }),
      { status: 400 },
    );
  });

  it('(c) releaseId missing throws ApiError 400', async () => {
    await expectApiError(
      saveSnapshot(db, TEAM, {
        releaseId: '',
        environment: ENV,
        buffer: PDF_BUF,
      }),
      { status: 400 },
    );
  });

  it('(c) environment missing throws ApiError 400', async () => {
    await expectApiError(
      saveSnapshot(db, TEAM, {
        releaseId: REL_ID,
        environment: '',
        buffer: PDF_BUF,
      }),
      { status: 400 },
    );
  });

  it('(c) buffer missing throws ApiError 400', async () => {
    await expectApiError(
      saveSnapshot(db, TEAM, {
        releaseId: REL_ID,
        environment: ENV,
        buffer: null,
      }),
      { status: 400 },
    );
  });

  it('(d) updateOne rejects — bucket.delete(newId) called for orphan cleanup, error rethrown', async () => {
    const stream = freshUploadStream();
    const newFileId = stream.id;

    const dbError = new Error('write failed');
    collections.reportSnapshots.updateOne = vi.fn().mockRejectedValue(dbError);

    await expect(
      saveSnapshot(db, TEAM, {
        releaseId: REL_ID,
        releaseName: '2.5',
        environment: ENV,
        generatedBy: 'Alice',
        buffer: PDF_BUF,
        filename: 'report.pdf',
      }),
    ).rejects.toThrow('write failed');

    // orphan cleanup: delete the freshly uploaded file
    expect(mockBucket.delete).toHaveBeenCalledWith(newFileId);
  });
});

// ---------------------------------------------------------------------------
// listSnapshots
// ---------------------------------------------------------------------------

describe('listSnapshots', () => {
  it('(e) calls find with { teamId } and returns toClientDoc-mapped docs', async () => {
    const id = new ObjectId();
    const at = new Date('2026-06-01T00:00:00Z');
    const rawDocs = [
      {
        _id: id,
        teamId: TEAM,
        releaseId: REL_ID,
        environment: ENV,
        filename: 'report.pdf',
        generatedAt: at,
      },
    ];

    collections.reportSnapshots = {
      find: vi.fn(() => ({
        sort: () => ({ toArray: async () => rawDocs }),
      })),
    };

    const results = await listSnapshots(db, TEAM);

    expect(collections.reportSnapshots.find).toHaveBeenCalledWith({
      teamId: TEAM,
    });
    expect(results).toHaveLength(1);
    expect(results[0]._id).toBe(id.toString());
    expect(results[0].generatedAt).toBe(at.toISOString());
  });

  it('(e) teamId "" throws ApiError 400', async () => {
    await expectApiError(listSnapshots(db, ''), { status: 400 });
  });

  it('(e) teamId null throws ApiError 400', async () => {
    await expectApiError(listSnapshots(db, null), { status: 400 });
  });
});

// ---------------------------------------------------------------------------
// getSnapshotFile
// ---------------------------------------------------------------------------

describe('getSnapshotFile', () => {
  it('(f) invalid ObjectId throws ApiError 404', async () => {
    await expectApiError(getSnapshotFile(db, TEAM, 'not-an-id'), {
      status: 404,
    });
  });

  it('(f) missing snapshot throws ApiError 404', async () => {
    collections.reportSnapshots.findOne = vi.fn().mockResolvedValue(null);
    const validId = new ObjectId().toString();
    await expectApiError(getSnapshotFile(db, TEAM, validId), { status: 404 });
  });

  it('(f) found — returns stream, filename, byteSize, contentType "application/pdf"', async () => {
    const fileId = new ObjectId();
    const snapshotId = new ObjectId();
    const doc = {
      _id: snapshotId,
      teamId: TEAM,
      fileId,
      filename: 'report.pdf',
      byteSize: 1234,
    };

    collections.reportSnapshots = {
      findOne: vi.fn().mockResolvedValue(doc),
      find: vi.fn(),
      updateOne: vi.fn(),
    };

    const fakeStream = Readable.from(Buffer.from('PDF'));
    mockBucket.openDownloadStream.mockReturnValue(fakeStream);

    const result = await getSnapshotFile(db, TEAM, snapshotId.toString());

    expect(result.stream).toBe(fakeStream);
    expect(result.filename).toBe('report.pdf');
    expect(result.byteSize).toBe(1234);
    expect(result.contentType).toBe('application/pdf');
    expect(mockBucket.openDownloadStream).toHaveBeenCalledWith(fileId);
  });

  it('(f) teamId "" throws ApiError 400', async () => {
    await expectApiError(getSnapshotFile(db, '', new ObjectId().toString()), {
      status: 400,
    });
  });

  it('(f) snapshotId "" throws ApiError 404', async () => {
    await expectApiError(getSnapshotFile(db, TEAM, ''), { status: 404 });
  });
});
