/**
 * reportSnapshotsData.js — storage layer for PDF report snapshots.
 *
 * One snapshot is retained per (teamId, releaseId, environment) combo.
 * Replacing a snapshot deletes the previous GridFS bytes.
 *
 * Required unique index (create once via migration / Atlas UI):
 *   db.collection("reportSnapshots").createIndex(
 *     { teamId: 1, releaseId: 1, environment: 1 },
 *     { unique: true }
 *   );
 *
 * @see {@link lib/__tests__/db/reportSnapshotsData.test.js}
 */

import { GridFSBucket, ObjectId } from 'mongodb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendEvent } from '@/lib/db/eventsData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';
import { getClient } from '@/lib/mongodb';

const COLLECTION = 'reportSnapshots';
const BUCKET_NAME = 'reportSnapshots';

/**
 * Serializes a snapshot metadata doc for the client. Delegates id/date
 * stringification to `toClientDoc` and drops the internal GridFS `fileId`
 * (an ObjectId the client never uses — downloads resolve by snapshot `_id`),
 * so the result is a plain object safe to pass from an RSC to a client component.
 *
 * @param {object} doc
 * @returns {object}
 */
function toSnapshotClientDoc(doc) {
  if (!doc) return doc;
  const { fileId: _fileId, ...rest } = doc;
  return toClientDoc(rest);
}

/**
 * Returns a GridFSBucket scoped to the reportSnapshots bucket.
 *
 * @param {import('mongodb').Db} db
 * @returns {import('mongodb').GridFSBucket}
 */
function getBucket(db) {
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
}

/**
 * Writes `buffer` to GridFS and resolves with the new GridFS file ObjectId.
 *
 * @param {import('mongodb').GridFSBucket} bucket
 * @param {string} filename
 * @param {Buffer} buffer
 * @param {{ teamId: string, releaseId: string, environment: string }} meta
 * @returns {Promise<import('mongodb').ObjectId>}
 */
function uploadToGridFS(bucket, filename, buffer, meta) {
  return new Promise((resolve, reject) => {
    const stream = bucket.openUploadStream(filename, { metadata: meta });
    stream.once('finish', () => resolve(stream.id));
    stream.once('error', reject);
    stream.end(buffer);
  });
}

/**
 * Stores (or replaces) the single PDF snapshot for a (release, environment) combo.
 * Exactly one snapshot is retained per combo — re-saving replaces the prior GridFS bytes.
 *
 * Flow:
 *  1. Guard inputs.
 *  2. Look up any existing metadata doc to capture the old fileId.
 *  3. Upload the new buffer to GridFS (not transactional).
 *  4. Inside a transaction: upsert metadata + append audit event.
 *  5. On success: delete the old GridFS file (best-effort).
 *  6. On failure: delete the freshly uploaded GridFS file (orphan cleanup).
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId: string, releaseName: string, environment: string, generatedBy: string, buffer: Buffer, filename: string }} opts
 * @returns {Promise<object>} Client metadata doc (via toClientDoc).
 * @see {@link lib/__tests__/db/reportSnapshotsData.test.js}
 */
export async function saveSnapshot(
  db,
  teamId,
  { releaseId, releaseName, environment, generatedBy, buffer, filename },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!environment) throw new ApiError(400, 'environment required');
  if (!buffer) throw new ApiError(400, 'buffer required');

  const bucket = getBucket(db);
  const col = db.collection(COLLECTION);

  // Find any pre-existing snapshot so we can delete its GridFS file after success.
  const existing = await col.findOne({ teamId, releaseId, environment });
  const oldFileId = existing?.fileId ?? null;

  // Upload bytes to GridFS first (not inside the transaction — GridFS streams
  // are not transactional, but we clean up on failure).
  const newFileId = await uploadToGridFS(
    bucket,
    filename ?? `snapshot-${releaseId}-${environment}.pdf`,
    buffer,
    { teamId, releaseId, environment },
  );

  const generatedAt = new Date();

  const client = await getClient();
  const session = client.startSession();
  try {
    await session.withTransaction(
      async () => {
        await col.updateOne(
          { teamId, releaseId, environment },
          {
            $set: {
              teamId,
              releaseId,
              releaseName: releaseName ?? '',
              environment,
              fileId: newFileId,
              filename: filename ?? `snapshot-${releaseId}-${environment}.pdf`,
              byteSize: buffer.length,
              generatedBy: generatedBy ?? null,
              generatedAt,
            },
          },
          { upsert: true, session },
        );

        // appendEvent does not accept a session; calling after the upsert is acceptable.
        await appendEvent(db, teamId, {
          category: AUDIT_CATEGORY.EXPORT,
          action: AUDIT_ACTION.EXPORT_PDF,
          releaseId,
          environment,
          caseId: null,
          by: generatedBy ?? null,
          at: generatedAt,
        });
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
  } catch (err) {
    // Orphan cleanup: remove the freshly uploaded GridFS file.
    await bucket.delete(newFileId).catch(() => {});
    throw err;
  } finally {
    await session.endSession();
  }

  // Replace: delete the old GridFS file (best-effort — don't fail the whole request).
  if (oldFileId) {
    await bucket.delete(oldFileId).catch(() => {});
  }

  // Read back the upserted doc to return a consistent client doc.
  const updated = await col.findOne({ teamId, releaseId, environment });
  if (!updated) throw new ApiError(500, 'Snapshot save could not be confirmed');
  return toSnapshotClientDoc(updated);
}

/**
 * Returns all PDF snapshots for the team, sorted newest-first.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @returns {Promise<object[]>} Array of client metadata docs.
 * @see {@link lib/__tests__/db/reportSnapshotsData.test.js}
 */
export async function listSnapshots(db, teamId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const docs = await db
    .collection(COLLECTION)
    .find({ teamId })
    .sort({ generatedAt: -1 })
    .toArray();
  return docs.map(toSnapshotClientDoc);
}

/**
 * Resolves a snapshot for streaming download.
 * Scopes the lookup by teamId to prevent cross-team access.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} snapshotId - String representation of the metadata ObjectId.
 * @returns {Promise<{ stream: import('stream').Readable, filename: string, byteSize: number, contentType: string }>}
 * @see {@link lib/__tests__/db/reportSnapshotsData.test.js}
 */
export async function getSnapshotFile(db, teamId, snapshotId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!snapshotId || !ObjectId.isValid(snapshotId)) {
    throw new ApiError(404, 'Snapshot not found');
  }

  const doc = await db
    .collection(COLLECTION)
    .findOne({ _id: new ObjectId(snapshotId), teamId });

  if (!doc) throw new ApiError(404, 'Snapshot not found');

  const bucket = getBucket(db);
  return {
    stream: bucket.openDownloadStream(doc.fileId),
    filename: doc.filename,
    byteSize: doc.byteSize,
    contentType: 'application/pdf',
  };
}
