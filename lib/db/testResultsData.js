import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  COMPLETED_STATUSES,
  STATUS,
} from '@/lib/constants';
import { appendEvent } from '@/lib/db/eventsData';
import { idMatch } from '@/lib/db/idQuery';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';

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
  if (status === STATUS.KNOWN_ISSUE) return AUDIT_ACTION.KNOWN_ISSUE;
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
 * Inserts one Pending result row per (tcId × environment) for every
 * environment the release currently declares. Reads the live environment list
 * inside the supplied session so the fan-out is consistent within a
 * transaction.
 *
 * Skips any (tcId, environment) pair that already has a row, so it is
 * safe to call when adding a single new case to an existing release.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string[]} tcIds
 * @param {import('mongodb').ClientSession} [session]
 */
export async function generateDenseResults(
  db,
  teamId,
  releaseId,
  tcIds,
  session,
  initialStatus = STATUS.PENDING,
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!tcIds?.length) return;

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

  for (const tcId of tcIds) {
    for (const environment of environments) {
      docs.push({
        teamId,
        releaseId,
        tcId,
        environment,
        status: initialStatus,
        testedBy: null,
        testedOn: null,
        notes: null,
        assignedTo: null,
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
 * Writes (last-write-wins) one result for a (tcId, environment) in the
 * given release. Enforces BR-15 and R21 on the interactive path:
 *   - BR-15 — `testedBy` must be provided (QA self-lock enforced at route
 *     layer; here we only verify it is not empty).
 *   - R21 — Pass or Fail requires the test case to have a non-blank
 *     `expectedResult`.
 *   - Future-date guard — `testedOn` may not be after the current UTC time.
 *   - Fail requires non-blank `notes`.
 *   - Pending reset requires a non-blank `reason`.
 *   - Known Issue reclassifies a currently-failed row: requires `testedBy`,
 *     and auto-fetches the Jira reference from the row's `jiraIssueKeys` (the
 *     Test Issue created on failure). `jiraKey` is used only as a fallback when
 *     no issue is linked; if neither is present the write is rejected.
 *
 * Appends a RESULT-category audit event.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} tcId
 * @param {string} environment
 * @param {{ status: string, testedBy: string, testedOn?: Date|string|null, notes?: string, reason?: string, jiraKey?: string }} payload
 * @param {object} [opts]
 * @param {import('mongodb').ClientSession} [opts.session]
 */
export async function recordResult(
  db,
  teamId,
  releaseId,
  tcId,
  environment,
  { status, testedBy, testedOn, notes, reason, jiraKey },
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

  // Known Issue requires a tester; its Jira key is auto-resolved from the row's
  // linked Test Issue below (falling back to a supplied key when none exists).
  if (status === STATUS.KNOWN_ISSUE && !testedBy?.trim()) {
    throw new ApiError(400, 'testedBy is required');
  }

  // testedBy required for Pass/Fail
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
        { _id: idMatch(tcId), teamId },
        { projection: { expectedResult: 1 }, session },
      );
    if (!testCase?.expectedResult?.trim()) {
      throw new ApiError(
        400,
        'Expected result must be set before marking Pass or Fail',
      );
    }
  }

  // Known Issue is a reclassification of a failure — only reachable from a
  // currently-failed row. Its Jira reference is auto-fetched from the Test
  // Issue linked when the case failed (`jiraIssueKeys`); a supplied `jiraKey`
  // is used only as a fallback when nothing is linked (e.g. Jira disabled).
  let knownIssueKeys = [];
  if (status === STATUS.KNOWN_ISSUE) {
    const current = await db
      .collection('testResults')
      .findOne(
        { teamId, releaseId, tcId, environment },
        { projection: { status: 1, jiraIssueKeys: 1 }, session },
      );
    if (!current) throw new ApiError(404, 'Result row not found');
    if (current.status !== STATUS.FAIL) {
      throw new ApiError(400, 'Known Issue can only be set on a failed test');
    }
    const linkedKeys = current.jiraIssueKeys ?? [];
    if (linkedKeys.length > 0) {
      knownIssueKeys = linkedKeys;
    } else if (jiraKey?.trim() && JIRA_KEY_RE.test(jiraKey.trim())) {
      knownIssueKeys = [jiraKey.trim()];
    } else {
      throw new ApiError(
        400,
        'No Jira issue is linked to this failure; provide a valid Jira key',
      );
    }
  }

  const now = new Date();
  let update;
  if (status === STATUS.PENDING) {
    update = {
      $set: {
        status: STATUS.PENDING,
        testedBy: null,
        testedOn: null,
        notes: null,
        updatedAt: now,
      },
    };
  } else if (status === STATUS.KNOWN_ISSUE) {
    update = {
      $set: {
        status,
        testedBy: testedBy ?? null,
        testedOn: testedOn ? new Date(testedOn) : now,
        notes: notes ?? null,
        updatedAt: now,
      },
      // Ensure the resolved ticket(s) stay linked; a no-op when the keys were
      // already stored from the on-fail flow.
      $addToSet: { jiraIssueKeys: { $each: knownIssueKeys } },
    };
  } else {
    update = {
      $set: {
        status,
        testedBy: testedBy ?? null,
        testedOn: testedOn ? new Date(testedOn) : now,
        notes: notes ?? null,
        updatedAt: now,
      },
    };
  }

  const result = await db
    .collection('testResults')
    .updateOne({ teamId, releaseId, tcId, environment }, update, { session });

  if (result.matchedCount === 0) {
    throw new ApiError(404, 'Result row not found');
  }

  await appendEvent(db, teamId, {
    category: AUDIT_CATEGORY.RESULT,
    action: resultAction(status),
    tcId,
    releaseId,
    environment,
    status,
    notes: notes ?? null,
    reason: reason ?? null,
    jiraKey:
      status === STATUS.KNOWN_ISSUE ? knownIssueKeys.join(', ') || null : null,
    by: testedBy ?? null,
    at: now,
  });
}

/**
 * Appends the key of a Jira issue created for a Fail to its result row
 * (`jiraIssueKeys` array — repeat failures keep every ticket). Separate from
 * `recordResult` because Jira creation happens after the result is saved (and
 * may not happen at all).
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} tcId
 * @param {string} environment
 * @param {string} jiraIssueKey - e.g. "RXR-5678"
 * @see {@link lib/__tests__/db/testResultsData.addResultJiraIssue.test.js}
 */
export async function addResultJiraIssue(
  db,
  teamId,
  releaseId,
  tcId,
  environment,
  jiraIssueKey,
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  await db.collection('testResults').updateOne(
    { teamId, releaseId, tcId, environment },
    {
      $push: { jiraIssueKeys: jiraIssueKey },
      $set: { updatedAt: new Date() },
    },
  );
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
 * @param {Array<{ tcId: string, status: string, testedBy: string, testedOn?: Date|string|null, notes?: string, reason?: string, jiraKey?: string }>} entries
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
    entries.map(({ tcId, ...payload }) =>
      recordResult(db, teamId, releaseId, tcId, environment, payload, {
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

/**
 * Minimal per-environment execution rows for a SINGLE test case across every
 * environment that has a row, ordered by environment name. Projects only the
 * fields the detail panel renders (no `_id`/`tcId`/`releaseId`/`teamId`/
 * `reason` — `reason` is never persisted on the row), so the payload stays
 * small and purpose-built for the panel's one-shot fetch.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} tcId
 * @returns {Promise<Array<{ environment: string, status: string, testedBy: string|null, testedOn: string|null, assignedTo: string|null, notes: string|null }>>}
 */
export async function listCaseResults(db, teamId, releaseId, tcId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!tcId) throw new ApiError(400, 'tcId required');

  const docs = await db
    .collection('testResults')
    .find(
      { teamId, releaseId, tcId },
      {
        projection: {
          _id: 0,
          environment: 1,
          status: 1,
          testedBy: 1,
          testedOn: 1,
          assignedTo: 1,
          notes: 1,
          jiraIssueKey: 1,
          jiraIssueKeys: 1,
        },
      },
    )
    .sort({ environment: 1 })
    .toArray();

  return docs.map((d) => ({
    environment: d.environment,
    status: d.status,
    testedBy: d.testedBy ?? null,
    testedOn:
      d.testedOn instanceof Date
        ? d.testedOn.toISOString()
        : (d.testedOn ?? null),
    assignedTo: d.assignedTo ?? null,
    notes: d.notes ?? null,
    // Fold the legacy single-key field into the array shape.
    jiraIssueKeys: d.jiraIssueKeys ?? (d.jiraIssueKey ? [d.jiraIssueKey] : []),
  }));
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
 *   `{ total: number, passed: number, failed: number, pending: number, knownIssue: number, passRate: number }`
 *
 * `passRate` is in the range 0–1; it is 0 when `total` is 0.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} [environment] - When provided, only that env is summarised.
 * @returns {Promise<Record<string, { total: number, passed: number, failed: number, pending: number, knownIssue: number, passRate: number }>>}
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
        knownIssue: {
          $sum: { $cond: [{ $eq: ['$status', STATUS.KNOWN_ISSUE] }, 1, 0] },
        },
      },
    },
  ];

  const rows = await db.collection('testResults').aggregate(pipeline).toArray();

  const summary = {};
  for (const row of rows) {
    const { _id: env, total, passed, failed, pending, knownIssue } = row;
    summary[env] = {
      total,
      passed,
      failed,
      pending,
      knownIssue,
      passRate: total > 0 ? passed / total : 0,
    };
  }

  return summary;
}
