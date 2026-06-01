import { NextResponse } from 'next/server';
import { ROLES } from '@/lib/constants';
import { getRelease } from '@/lib/db/releasesData';
import {
  bulkRecordResult,
  listResultsForRelease,
  recordResult,
  validateEnvironment,
} from '@/lib/db/testResultsData';
import { ApiError } from '@/lib/errors';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  bulkRecordResultBodySchema,
  recordResultBodySchema,
} from '@/lib/schemas/results';
import { withTeam } from '@/lib/server/withTeam';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the names of all active QA users for the team.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @returns {Promise<string[]>}
 */
async function getActiveQaUserNames(db, teamId) {
  const docs = await db
    .collection('users')
    .find({ teamId, role: ROLES.QA, active: true }, { projection: { name: 1 } })
    .toArray();
  return docs.map((u) => u.name);
}

/**
 * Enforces BR-15 and the admin-testedBy validation rule:
 *   - QA: `testedBy` is forced to `session.user.name` (returned as the
 *     resolved value; the caller's supplied value is silently overridden).
 *   - Admin: if `testedBy` is supplied it must be the name of an active QA
 *     user on the team. Returns it unchanged when valid; throws 400 otherwise.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {import('next-auth').Session} session
 * @param {string|undefined} testedBy - Value from the request body.
 * @returns {Promise<string|undefined>} Resolved `testedBy` value.
 */
async function resolveTestedBy(db, teamId, session, testedBy) {
  if (session.user.role === ROLES.QA) {
    // BR-15: QA can only record themselves as tester
    return session.user.name;
  }

  // Admin path: validate against active QA users when a value is supplied
  if (testedBy) {
    const qaNames = await getActiveQaUserNames(db, teamId);
    if (!qaNames.includes(testedBy)) {
      throw new ApiError(
        400,
        `"${testedBy}" is not an active QA user for this team`,
      );
    }
  }

  return testedBy;
}

// ---------------------------------------------------------------------------
// GET /api/releases/[id]/results
// ---------------------------------------------------------------------------

/**
 * Lists result rows for a release.
 *
 * Query params:
 *   environment (optional) — filter to one environment
 *   summary (optional, "true") — return counts only
 *
 * Open to admin and QA.
 *
 * @see {@link app/api/releases/[id]/results/__tests__/route.test.js}
 */
export const GET = withTeam(async (request, { params }, { teamId, db }) => {
  const { id: releaseId } = await params;
  const { searchParams } = new URL(request.url);
  const environment = searchParams.get('environment') || undefined;

  const results = await listResultsForRelease(db, teamId, releaseId, {
    environment,
  });

  return NextResponse.json(results);
});

// ---------------------------------------------------------------------------
// POST /api/releases/[id]/results — record a single result
// ---------------------------------------------------------------------------

/**
 * Records a single (caseId × environment) result for the release.
 *
 * BR-15: QA users are forced to `testedBy = self`. Admins may supply any
 * active QA user's name.
 * R21: enforced inside `recordResult` — Pass/Fail requires a non-blank
 * `expectedResult` on the test case.
 *
 * Body (application/json):
 *   caseId, releaseId, environment, status, testedBy?, testedOn?, notes?, reason?
 *
 * Open to admin and QA (withTeam).
 *
 * @see {@link app/api/releases/[id]/results/__tests__/route.test.js}
 */
export const POST = withTeam(
  async (request, { params }, { teamId, db, session }) => {
    const rl = checkRateLimit(`results:record:${session.user.id}`, 120, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests — slow down' },
        { status: 429 },
      );
    }

    const { id: releaseId } = await params;
    const body = await request.json();

    const parsed = recordResultBodySchema.safeParse({ ...body, releaseId });
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid body',
      );
    }

    const { caseId, environment, status, testedOn, notes, reason } =
      parsed.data;

    // Validate the release exists and the environment is declared
    const release = await getRelease(db, teamId, releaseId);
    if (release.archived) {
      throw new ApiError(
        409,
        'This release is archived and cannot be modified',
      );
    }
    validateEnvironment(release, environment);

    // BR-15 + admin testedBy validation
    const testedBy = await resolveTestedBy(
      db,
      teamId,
      session,
      parsed.data.testedBy,
    );

    await recordResult(db, teamId, releaseId, caseId, environment, {
      status,
      testedBy,
      testedOn,
      notes,
      reason,
    });

    return NextResponse.json({ ok: true });
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/releases/[id]/results — bulk record results
// ---------------------------------------------------------------------------

/**
 * Bulk-records the same status for multiple cases in one (release, environment).
 *
 * BR-15 and admin testedBy validation apply identically to POST.
 *
 * Body (application/json):
 *   releaseId, environment, status, caseIds[], testedBy?, testedOn?, notes?, reason?
 *
 * Open to admin and QA (withTeam).
 *
 * @see {@link app/api/releases/[id]/results/__tests__/route.test.js}
 */
export const PATCH = withTeam(
  async (request, { params }, { teamId, db, session }) => {
    const rl = checkRateLimit(`results:bulk:${session.user.id}`, 60, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'Too many requests — slow down' },
        { status: 429 },
      );
    }

    const { id: releaseId } = await params;
    const body = await request.json();

    const parsed = bulkRecordResultBodySchema.safeParse({ ...body, releaseId });
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message || 'Invalid body',
      );
    }

    const { environment, status, caseIds, testedOn, notes, reason } =
      parsed.data;

    // Validate the release exists and the environment is declared
    const release = await getRelease(db, teamId, releaseId);
    if (release.archived) {
      throw new ApiError(
        409,
        'This release is archived and cannot be modified',
      );
    }
    validateEnvironment(release, environment);

    // BR-15 + admin testedBy validation
    const testedBy = await resolveTestedBy(
      db,
      teamId,
      session,
      parsed.data.testedBy,
    );

    const entries = caseIds.map((caseId) => ({
      caseId,
      status,
      testedBy,
      testedOn,
      notes,
      reason,
    }));

    await bulkRecordResult(db, teamId, releaseId, environment, entries);

    return NextResponse.json({ ok: true });
  },
);
