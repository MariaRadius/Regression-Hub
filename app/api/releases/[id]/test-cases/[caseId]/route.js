import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import {
  deleteTestCase,
  getTestCase,
  updateTestCase,
} from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { updateTestCaseBodySchema } from '@/lib/schemas/testCases';
import { withAdmin, withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/releases/[id]/test-cases/[caseId]
 *
 * Returns a single test case. Open to admin and QA.
 *
 * Note: `caseId` here is the testCase MongoDB `_id`, not the lineage `caseId`
 * field. The URL segment name is `[caseId]` per the plan but the DB lookup uses
 * the document `_id`.
 *
 * @see {@link app/api/releases/[id]/test-cases/[caseId]/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, { params }, { teamId, db }) => {
  const { caseId } = await params;
  const tc = await getTestCase(db, teamId, caseId);
  return NextResponse.json(tc);
});

/**
 * PATCH /api/releases/[id]/test-cases/[caseId]
 *
 * Updates content fields on a release-scoped test case. Admin-only.
 *
 * Status, tester, and result data live on `testResults` — not settable here.
 *
 * Optional `resetAllToPending` (bool) with `resetReason` (string) resets all
 * environments' results for this case to Pending within a transaction.
 *
 * @see {@link app/api/releases/[id]/test-cases/[caseId]/__tests__/route.test.js}
 */
export const PATCH = withAdmin(
  async (request, { params }, { teamId, db, session }) => {
    const { caseId } = await params;
    const body = await request.json();

    const parsed = updateTestCaseBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid body',
      );
    }

    const result = await updateTestCase(db, teamId, caseId, parsed.data, {
      actor: session.user.name,
    });

    revalidatePath('/(app)/test-cases', 'page');
    revalidatePath('/(app)/dashboard', 'page');
    return NextResponse.json(result);
  },
);

/**
 * DELETE /api/releases/[id]/test-cases/[caseId]
 *
 * Deletes a test case and cascades its results across all environments and its
 * assignments within a transaction. Admin-only.
 *
 * Requires `{ confirm: 'DELETE' }` in the request body to prevent accidental
 * deletion (A10 — explicit confirmation for destructive actions).
 *
 * @see {@link app/api/releases/[id]/test-cases/[caseId]/__tests__/route.test.js}
 */
export const DELETE = withAdmin(
  async (request, { params }, { teamId, db, session }) => {
    const { caseId } = await params;
    const body = await request.json().catch(() => ({}));

    if (body?.confirm !== 'DELETE') {
      throw new ApiError(
        400,
        'Confirmation required: send { confirm: "DELETE" } to delete a test case',
      );
    }

    const result = await deleteTestCase(db, teamId, caseId, {
      actor: session.user.name,
    });

    revalidatePath('/(app)/test-cases', 'page');
    revalidatePath('/(app)/dashboard', 'page');
    return NextResponse.json(result);
  },
);
