import { z } from 'zod';
import { get, post } from '@/lib/http/client';

/**
 * Zod schema for a snapshot metadata document returned by the API.
 *
 * @see lib/__tests__/api/snapshots.test.js
 */
const snapshotMetaSchema = z
  .object({
    _id: z.string(),
    releaseId: z.string(),
    releaseName: z.string(),
    environment: z.string(),
    filename: z.string(),
    byteSize: z.number(),
    generatedBy: z.string(),
    generatedAt: z.string(),
  })
  .passthrough();

/**
 * List all stored PDF snapshots for the current team (Version History).
 *
 * @param {object} [opts] - Extra options forwarded to the http client.
 * @returns {Promise<Array>}
 * @see lib/__tests__/api/snapshots.test.js
 */
export function listSnapshots(opts = {}) {
  return get('/api/snapshots', {
    schema: z.array(snapshotMetaSchema),
    ...opts,
  });
}

/**
 * Upload a PDF snapshot for a release + environment.
 * The caller builds the FormData with fields: file, environment, filename.
 *
 * @param {string} releaseId
 * @param {FormData} formData
 * @param {object} [opts] - Extra options forwarded to the http client.
 * @returns {Promise<object>} Saved snapshot metadata doc.
 * @see lib/__tests__/api/snapshots.test.js
 */
export function saveSnapshot(releaseId, formData, opts = {}) {
  return post(`/api/releases/${releaseId}/snapshot`, formData, {
    schema: snapshotMetaSchema,
    ...opts,
  });
}

/**
 * Returns the URL to download a stored PDF snapshot by id.
 * Pure — no network call.
 *
 * @param {string} id - Snapshot document _id.
 * @returns {string}
 * @see lib/__tests__/api/snapshots.test.js
 */
export function snapshotDownloadUrl(id) {
  return `/api/snapshots/${id}/download`;
}
