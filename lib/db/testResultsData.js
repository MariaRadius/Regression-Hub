import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  COMPLETED_STATUSES,
  STATUS,
} from '@/lib/constants';
import { appendEvent } from '@/lib/db/eventsData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the audit action string for a given result status.
 *
 * @param {string} status - A STATUS constant value.
 * @returns {string}
 */
function resultAction(status) {
  if (status === STATUS.PASS) return AUDIT_ACTION.PASS;
  if (status === STATUS.FAIL) return AUDIT_ACTION.FAIL;
  return AUDIT_ACTION.RESET;
}

// ---------------------------------------------------------------------------
// Validation guard — single shared 400 enforcement point
// ---------------------------------------------------------------------------

/**
 * Throws ApiError(400) when `environment` is not declared by `release`.
 * Import this wherever an environment value is accepted from the caller.
 *
 * @param {{ environments: string[] }} release
 * @param {string} environment
 */
export function validateEnvironment(release, environment) {
  if (!release?.environments?.includes(environment)) {
    throw new ApiError(
      400,
      `Environment "${environment}" is not declared by this release`,
    );
  }
}

// ---------------------------------------------------------------------------
// Dense-result generation
// ---------------------------------------------------------------------------

/**
 * Inserts one Pending result row per (caseId × environment) for every
 * environment the release currently declares. Reads the live environment list
 * inside the supplied session so the fan-out is consistent within a
 * transaction.
 *
 * Skips any (caseId, environment) pair that already has a row, so it is
 * safe to call when adding a single new case to an existing release.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string[]} caseIds
 * @param {import('mongodb').ClientSession} [session]
 */
export async function generateDenseResults(
  db,
  teamId,
  releaseId,
  caseIds,
  session,
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!caseIds?.length) return;

  const release = await db
    .collection('releases')
    .findOne(
      { _id: releaseId, teamId },
      { projection: { environments: 1 }, session },
    );

  if (!release) throw new ApiError(404, 'Release not found');

  const { environments } = release;
  if (!environments?.length) return;

  const now = new Date();
  const docs = [];

  for (const caseId of caseIds) {
    for (const environment of environments) {
      docs.push({
        teamId,
        releaseId,
        caseId,
        environment,
        status: STATUS.PENDING,
        testedBy: null,
        testedOn: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  // ordered:false lets the bulk continue past duplicate-key errors so we skip
  // existing rows without failing the whole batch.
  await db.collection('testResults').insertMany(docs, {
    ordered: false,
    session,
  });
}

// ---------------------------------------------------------------------------
// Record a single result
// ---------------------------------------------------------------------------

/**
 * Writes (last-write-wins) one result for a (caseId, environment) in the
 * given release. Enforces BR-15 and R21 on the interactive path:
 *   - BR-15 — `testedBy` must be provided (QA self-lock enforced at route
 *     layer; here we only verify it is not empty).
 *   - R21 — Pass or Fail requires the test case to have a non-blank
 *     `expectedResult`.
 *   - Future-date guard — `testedOn` may not be after the current UTC time.
 *   - Fail requires non-blank `notes`.
 *   - Pending reset requires a non-blank `reason`.
 *
 * Appends a RESULT-category audit event.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} caseId
 * @param {string} environment
 * @param {{ status: string, testedBy: string, testedOn?: Date|string|null, notes?: string, reason?: string }} payload
 * @param {object} [opts]
 * @param {import('mongodb').ClientSession} [opts.session]
 */
export async function recordResult(
  db,
  teamId,
  releaseId,
  caseId,
  environment,
  { status, testedBy, testedOn, notes, reason },
  { session } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  // Validate status value
  const validStatuses = Object.values(STATUS);
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, `Invalid status "${status}"`);
  }

  // Fail requires notes
  if (status === STATUS.FAIL && !notes?.trim()) {
    throw new ApiError(400, 'Notes are required when marking Fail');
  }

  // Pending reset requires reason
  if (status === STATUS.PENDING && !reason?.trim()) {
    throw new ApiError(400, 'Reason is required when resetting to Pending');
  }

  // testedBy required for non-Pending
  if (COMPLETED_STATUSES.includes(status) && !testedBy?.trim()) {
    throw new ApiError(400, 'testedBy is required');
  }

  // Future-date guard
  if (testedOn) {
    const date = testedOn instanceof Date ? testedOn : new Date(testedOn);
    if (!Number.isNaN(date.getTime()) && date > new Date()) {
      throw new ApiError(400, 'testedOn cannot be in the future');
    }
  }

  // R21 — expected result required to mark Pass/Fail
  if (COMPLETED_STATUSES.includes(status)) {
    const testCase = await db
      .collection('testCases')
      .findOne(
        { caseId, releaseId, teamId },
        { projection: { expectedResult: 1 }, session },
      );
    if (!testCase?.expectedResult?.trim()) {
      throw new ApiError(
        400,
        'Expected result must be set before marking Pass or Fail',
      );
    }
  }

  const now = new Date();
  const update =
    status === STATUS.PENDING
      ? {
          $set: {
            status: STATUS.PENDING,
            testedBy: null,
            testedOn: null,
            notes: null,
            updatedAt: now,
          },
        }
      : {
          $set: {
            status,
            testedBy: testedBy ?? null,
            testedOn: testedOn ? new Date(testedOn) : now,
            notes: notes ?? null,
            updatedAt: now,
          },
        };

  const result = await db
    .collection('testResults')
    .updateOne({ teamId, releaseId, caseId, environment }, update, { session });

  if (result.matchedCount === 0) {
    throw new ApiError(404, 'Result row not found');
  }

  await appendEvent(db, teamId, {
    category: AUDIT_CATEGORY.RESULT,
    action: resultAction(status),
    caseId,
    releaseId,
    environment,
    status,
    notes: notes ?? null,
    reason: reason ?? null,
    by: testedBy ?? null,
    at: now,
  });
}

// ---------------------------------------------------------------------------
// Bulk record results
// ---------------------------------------------------------------------------

/**
 * Records results for multiple cases in the same (release, environment) in
 * parallel. Each entry in `entries` is passed through `recordResult`
 * individually so all validations (BR-15, R21, future-date) apply per row.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} environment
 * @param {Array<{ caseId: string, status: string, testedBy: string, testedOn?: Date|string|null, notes?: string, reason?: string }>} entries
 * @param {object} [opts]
 * @param {import('mongodb').ClientSession} [opts.session]
 */
export async function bulkRecordResult(
  db,
  teamId,
  releaseId,
  environment,
  entries,
  { session } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!entries?.length) return;

  await Promise.all(
    entries.map(({ caseId, ...payload }) =>
      recordResult(db, teamId, releaseId, caseId, environment, payload, {
        session,
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// List results
// ---------------------------------------------------------------------------

/**
 * Returns all result rows for a release, optionally filtered to one
 * environment.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {{ environment?: string }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listResultsForRelease(
  db,
  teamId,
  releaseId,
  { environment } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const query = { teamId, releaseId };
  if (environment) query.environment = environment;

  const docs = await db
    .collection('testResults')
    .find(query)
    .sort({ environment: 1, createdAt: 1 })
    .toArray();

  return docs.map(toClientDoc);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Returns per-environment pass/fail/pending counts and pass rate for a
 * release. When `environment` is provided the result object is scoped to
 * that single environment; when omitted, one entry per declared environment
 * is returned.
 *
 * Shape of each entry:
 *   `{ total: number, passed: number, failed: number, pending: number, passRate: number }`
 *
 * `passRate` is in the range 0–1; it is 0 when `total` is 0.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} [environment] - When provided, only that env is summarised.
 * @returns {Promise<Record<string, { total: number, passed: number, failed: number, pending: number, passRate: number }>>}
 */
export async function getResultSummary(db, teamId, releaseId, environment) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const matchStage = { teamId, releaseId };
  if (environment) matchStage.environment = environment;

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: '$environment',
        total: { $sum: 1 },
        passed: {
          $sum: { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] },
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', STATUS.PENDING] }, 1, 0] },
        },
      },
    },
  ];

  const rows = await db.collection('testResults').aggregate(pipeline).toArray();

  const summary = {};
  for (const row of rows) {
    const { _id: env, total, passed, failed, pending } = row;
    summary[env] = {
      total,
      passed,
      failed,
      pending,
      passRate: total > 0 ? passed / total : 0,
    };
  }

  return summary;
}
