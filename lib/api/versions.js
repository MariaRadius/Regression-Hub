import { del, get, post } from '@/lib/http/client';
import { z } from 'zod';

const versionSchema = z
  .object({
    version: z.string(),
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    pending: z.number(),
    passRate: z.number(),
    isCurrent: z.boolean(),
  })
  .passthrough();

const zOk = z.object({ ok: z.literal(true) }).passthrough();

export function listVersions(opts = {}) {
  return get('/api/versions', {
    schema: z.array(versionSchema),
    cache: 'no-store',
    ...opts,
  });
}

export function deleteVersion({ version, isCurrent }, opts = {}) {
  return del('/api/versions', {
    params: { version, isCurrent: String(isCurrent) },
    schema: zOk,
    ...opts,
  });
}

export function restoreVersion(version, opts = {}) {
  return post('/api/versions/restore', { version }, { schema: zOk, ...opts });
}

export function completeVersion(version, opts = {}) {
  return post('/api/versions/complete', { version }, { schema: zOk, ...opts });
}

export function getVersionHistoryDetail(version, opts = {}) {
  return get('/api/versions/history-detail', {
    params: { version },
    schema: z
      .object({ version: z.string(), summary: z.object({}).passthrough() })
      .passthrough(),
    ...opts,
  });
}
