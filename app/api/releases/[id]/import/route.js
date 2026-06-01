import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { analyseImport, commitImport } from '@/lib/db/importExcelData';
import { ApiError } from '@/lib/errors';
import { importBodySchema } from '@/lib/schemas/import';
import { withAdmin } from '@/lib/server/withTeam';
import { deriveInitial } from '@/utils/appInitial';

// Process-safety floor caps (tunable). These are the server-side defaults;
// the client enforces the same values pre-upload (decision B).
const MAX_ROWS = 10_000;
const MAX_FIELD_CHARS = 20_000;

/**
 * POST /api/releases/[id]/import
 *
 * Two-phase import route gated to admins. Accepts application/json.
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
 * Body (application/json):
 *   rows                — parsed row array (required)
 *   confirmed           — boolean (optional, default false)
 *   environment         — target environment name (required when confirmed: true)
 *   appInitialOverrides — Record<appName, initial> (optional)
 */
export const POST = withAdmin(async (request, context, { teamId, db }) => {
  const { id: releaseId } = await context.params;

  // --- Parse and zod-validate body (process-safety floor) ---
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
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
