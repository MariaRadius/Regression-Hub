import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { analyseImport, commitImport } from '@/lib/db/importExcelData';
import { ApiError } from '@/lib/errors';
import { importBodySchema } from '@/lib/schemas/import';
import { withAdmin } from '@/lib/server/withTeam';
import { deriveInitial } from '@/utils/appInitial';

const gunzipAsync = promisify(gunzip);

// Process-safety floor caps (tunable). These are the server-side defaults;
// the client enforces the same values pre-upload (decision B).
const MAX_ROWS = 10_000;
const MAX_FIELD_CHARS = 20_000;
// Pre-gunzip cap: rejects compressed bodies larger than 50 MB to prevent
// zip-bomb OOM before decompression expands the payload.
const MAX_COMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB

/**
 * POST /api/releases/[id]/import
 *
 * Two-phase import route gated to admins. Accepts application/gzip
 * (gzip-compressed JSON body — Phase 3).
 *
 * @see {@link app/api/releases/[id]/import/__tests__/route.test.js}
 *
 * Phase 1 — confirmed: false (or omitted)
 *   Runs analyseImport (dry-run). Returns a preview with create/update counts,
 *   row-level resolutions, proposed initials for new apps, errors, and warnings.
 *   Nothing is written.
 *
 * Phase 2 — confirmed: true
 *   Runs commitImport (transactional). Re-resolves identity in-session, upserts
 *   apps/modules/test-cases, fans out dense Pending results, writes result
 *   columns to the chosen environment (bypassing interactive validation per A2),
 *   and appends IMPORT audit events. All-or-nothing (decision 14).
 *   Returns { imported, updated, releaseId }.
 *
 * Body (application/gzip over JSON):
 *   rows                — parsed row array (required)
 *   confirmed           — boolean (optional, default false)
 *   environment         — target environment name (required when confirmed: true)
 *   appInitialOverrides — Record<appName, initial> (optional)
 */
export const POST = withAdmin(async (request, context, { teamId, db }) => {
  const { id: releaseId } = await context.params;

  // --- Gunzip then JSON-parse the body (process-safety floor) ---
  // Phase 3: client sends application/gzip (CompressionStream). We read the raw
  // bytes, gunzip, and parse the JSON. Malformed gzip or non-JSON → 400.
  let body;
  try {
    const raw = Buffer.from(await request.arrayBuffer());
    if (raw.length === 0)
      throw new ApiError(400, 'Request body must not be empty');
    if (raw.length > MAX_COMPRESSED_BYTES) {
      throw new ApiError(
        400,
        `Compressed body exceeds the ${MAX_COMPRESSED_BYTES}-byte limit`,
      );
    }
    const decompressed = await gunzipAsync(raw);
    body = JSON.parse(decompressed.toString('utf8'));
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'Request body must be valid gzip-compressed JSON');
  }

  const parsed = importBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      400,
      parsed.error.errors[0]?.message ?? 'Invalid request body',
    );
  }

  const {
    rows,
    confirmed = false,
    environment = '',
    appInitialOverrides = {},
  } = parsed.data;

  // --- Server process-safety floor caps ---
  if (rows.length > MAX_ROWS) {
    throw new ApiError(
      400,
      `Row count ${rows.length} exceeds the ${MAX_ROWS}-row limit`,
    );
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (const [key, val] of Object.entries(row)) {
      if (typeof val === 'string' && val.length > MAX_FIELD_CHARS) {
        throw new ApiError(
          400,
          `Row ${i + 1}: field "${key}" exceeds the ${MAX_FIELD_CHARS}-character limit`,
        );
      }
    }
  }

  // --- Guard deriveInitial throw: a new-app name with no alphanumeric chars
  //     must yield a clean 400, never a 500 (floor guarantee). ---
  const uniqueAppNames = [
    ...new Set(rows.map((r) => r.applicationName || 'Default Application')),
  ];
  for (const appName of uniqueAppNames) {
    if (!(appName in appInitialOverrides)) {
      try {
        deriveInitial(appName);
      } catch {
        throw new ApiError(
          400,
          `Application "${appName}" has no alphanumeric characters`,
        );
      }
    }
  }

  if (!confirmed) {
    // --- Phase 1: dry-run analysis ---
    const preview = await analyseImport(db, teamId, { rows, releaseId });
    return NextResponse.json(preview);
  }

  // --- Phase 2: commit ---
  if (!environment.trim()) {
    throw new ApiError(400, 'environment is required when confirmed is true');
  }

  const result = await commitImport(db, teamId, {
    rows,
    releaseId,
    environment,
    appInitialOverrides,
  });

  revalidatePath('/(app)/releases', 'page');
  revalidatePath('/(app)/test-cases', 'page');
  revalidatePath('/(app)/dashboard', 'page');
  revalidatePath('/(app)/reports', 'page');

  return NextResponse.json(result);
});
