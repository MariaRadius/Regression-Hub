import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { analyseImport, commitImport } from '@/lib/db/importExcelData';
import { ApiError } from '@/lib/errors';
import { withAdmin } from '@/lib/server/withTeam';

// Mirror the FE MIME set. Ambiguous types (octet-stream / empty) fall back to
// extension check — the FE already guards these, but the BE must not trust the client.
const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

function isValidXlsxFile(file) {
  const mime = file.type ?? '';
  if (mime === 'application/octet-stream' || mime === '') {
    return file.name?.toLowerCase().endsWith('.xlsx') ?? false;
  }
  return XLSX_MIMES.has(mime);
}

/**
 * POST /api/releases/[id]/import
 *
 * Two-phase import route gated to admins.
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
 * Form fields:
 *   file                — .xlsx workbook (required)
 *   releaseId           — target release ObjectId string (required)
 *   environment         — target environment name for result columns (required)
 *   confirmed           — "true" | "false" (optional, default "false")
 *   appInitialOverrides — JSON-encoded Record<appName, initial> (optional)
 */
export const POST = withAdmin(async (request, context, { teamId, db }) => {
  const { id: releaseId } = await context.params;

  const formData = await request.formData();

  const file = formData.get('file');
  const environment = (formData.get('environment') ?? '').trim();
  const confirmedRaw = formData.get('confirmed');
  const confirmed = confirmedRaw === 'true' || confirmedRaw === true;
  const appInitialOverridesRaw = formData.get('appInitialOverrides');

  // --- Validate file presence and type ---
  if (!file) throw new ApiError(400, 'No file uploaded');
  if (!isValidXlsxFile(file)) {
    throw new ApiError(
      400,
      'Invalid file type. Upload a .xlsx Excel workbook.',
    );
  }

  // --- Parse appInitialOverrides if provided ---
  let appInitialOverrides = {};
  if (appInitialOverridesRaw) {
    try {
      appInitialOverrides = JSON.parse(appInitialOverridesRaw);
      if (
        typeof appInitialOverrides !== 'object' ||
        Array.isArray(appInitialOverrides)
      ) {
        throw new Error('must be a JSON object');
      }
    } catch {
      throw new ApiError(
        400,
        'appInitialOverrides must be a valid JSON object',
      );
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;

  if (!confirmed) {
    // --- Phase 1: dry-run analysis ---
    const preview = await analyseImport(db, teamId, {
      buffer,
      fileName,
      releaseId,
    });
    return NextResponse.json(preview);
  }

  // --- Phase 2: commit ---
  if (!environment) {
    throw new ApiError(400, 'environment is required when confirmed is true');
  }

  const result = await commitImport(db, teamId, {
    buffer,
    fileName,
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
