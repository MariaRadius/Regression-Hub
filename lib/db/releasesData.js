import { ObjectId } from 'mongodb';
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  CASCADE_CATEGORIES,
  DEFAULT_ENVIRONMENTS,
  STATUS,
} from '@/lib/constants';
import { appendEvent } from '@/lib/db/eventsData';
import { generateDenseResults } from '@/lib/db/testResultsData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';
import { getClient } from '@/lib/mongodb';
import {
  environmentNameSchema,
  releaseNameSchema,
} from '@/lib/schemas/releases';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Throws ApiError(409) when the release is archived. Call this at the top of
 * every mutation to honour the "archived = read-only" invariant.
 *
 * @param {{ archived?: boolean }} release
 * @param {string} [label] - Human-readable name for the error message.
 */
function assertNotArchived(release, label = 'This release') {
  if (release?.archived) {
    throw new ApiError(409, `${label} is archived and cannot be modified`);
  }
}

/**
 * Normalises an environment name: uppercase + trim.
 *
 * @param {string} env
 * @returns {string}
 */
function normaliseEnv(env) {
  return env.trim().toUpperCase();
}

/**
 * Validates `value` against `schema`, throwing ApiError(400) on the first issue.
 *
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} value
 * @returns {T}
 */
function parseField(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? 'Invalid value');
  }
  return parsed.data;
}

/**
 * Returns a release document scoped to `teamId`, throwing 404 if absent.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {import('mongodb').ClientSession} [session]
 * @returns {Promise<object>}
 */
async function requireRelease(db, teamId, releaseId, session) {
  const doc = await db
    .collection('releases')
    .findOne({ _id: releaseId, teamId }, { session });
  if (!doc) throw new ApiError(404, 'Release not found');
  return doc;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Lists releases for a team, newest-first.
 *
 * By default only non-archived releases are returned. Pass
 * `{ includeArchived: true }` to include archived ones (e.g. search typeahead).
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ includeArchived?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listReleases(
  db,
  teamId,
  { includeArchived = false } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const query = { teamId };
  if (!includeArchived) query.archived = { $ne: true };

  const docs = await db
    .collection('releases')
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map(toClientDoc);
}

// ---------------------------------------------------------------------------
// Get single
// ---------------------------------------------------------------------------

/**
 * Returns a single release. Throws 404 when the id does not exist or belongs
 * to a different team.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @returns {Promise<object>}
 */
export async function getRelease(db, teamId, releaseId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const doc = await db
    .collection('releases')
    .findOne({ _id: releaseId, teamId });

  if (!doc) throw new ApiError(404, 'Release not found');

  return toClientDoc(doc);
}

// ---------------------------------------------------------------------------
// Create (empty / clone)
// ---------------------------------------------------------------------------

/**
 * Creates a new release. Three modes:
 *
 * - **Empty** (default): no test cases; environments default to DEFAULT_ENVIRONMENTS
 *   unless overridden.
 * - **Clone** (`cloneFromId` provided): copies all test cases from the source
 *   release into the new one, keeping their `caseId` and `testKey`. Pending
 *   results are regenerated. Assignments are carried only when `carryAssignments`
 *   is `true`. The whole operation runs in a transaction.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ name: string, environments?: string[], cloneFromId?: string, carryAssignments?: boolean }} body
 * @param {{ actor?: string }} [opts]
 * @returns {Promise<{ ok: boolean, id: string }>}
 * @see {@link lib/__tests__/db/releasesData.test.js}
 */
export async function createRelease(db, teamId, body, { actor } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const {
    name,
    environments: rawEnvs,
    cloneFromId,
    carryAssignments = false,
  } = body;

  const cleanName = parseField(releaseNameSchema, name);

  const environments = rawEnvs?.length
    ? rawEnvs.map((e) => normaliseEnv(parseField(environmentNameSchema, e)))
    : [...DEFAULT_ENVIRONMENTS];

  if (environments.length === 0) {
    throw new ApiError(400, 'At least one environment is required');
  }

  // Validate name uniqueness within team
  const existing = await db
    .collection('releases')
    .findOne({ teamId, name: cleanName });
  if (existing) {
    throw new ApiError(409, `A release named "${cleanName}" already exists`);
  }

  const now = new Date();
  const releaseId = new ObjectId().toString();

  const releaseDoc = {
    _id: releaseId,
    teamId,
    name: cleanName,
    environments,
    archived: false,
    clonedFrom: cloneFromId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  if (!cloneFromId) {
    // --- Empty release ---
    await db.collection('releases').insertOne(releaseDoc);

    await appendEvent(db, teamId, {
      category: AUDIT_CATEGORY.RELEASE,
      action: AUDIT_ACTION.CREATE,
      releaseId,
      environment: null,
      caseId: null,
      by: actor ?? null,
      at: now,
    });

    return { ok: true, id: releaseId };
  }

  // --- Clone release (transactional) ---
  const client = await getClient();
  const session = client.startSession();

  try {
    await session.withTransaction(
      async () => {
        // Verify source exists and belongs to the team
        const source = await db
          .collection('releases')
          .findOne({ _id: cloneFromId, teamId }, { session });
        if (!source) throw new ApiError(404, 'Source release not found');

        // Insert the new release doc
        await db.collection('releases').insertOne(releaseDoc, { session });

        // Copy test cases from the source release — keep caseId + testKey,
        // strip old _id, point to the new releaseId.
        const sourceCases = await db
          .collection('testCases')
          .find({ teamId, releaseId: cloneFromId }, { session })
          .toArray();

        const now2 = new Date();
        let caseIds = [];

        if (sourceCases.length > 0) {
          // Strip _id so MongoDB auto-assigns new ObjectIds; keep caseId + testKey for lineage.
          const newCaseDocs = sourceCases.map(
            ({
              _id,
              releaseId: _srcReleaseId,
              createdAt: _ca,
              updatedAt: _ua,
              ...rest
            }) => ({
              ...rest,
              releaseId,
              createdAt: now2,
              updatedAt: now2,
            }),
          );

          await db.collection('testCases').insertMany(newCaseDocs, { session });

          // The caseIds are from the original test cases (lineage identifiers)
          caseIds = sourceCases.map((tc) => tc.caseId);

          // Generate dense Pending results for all cloned cases × environments
          // generateDenseResults reads environments from the release we just inserted
          if (caseIds.length > 0) {
            await generateDenseResults(db, teamId, releaseId, caseIds, session);
          }
        }

        // Optionally carry assignments
        if (carryAssignments) {
          const sourceAssignments = await db
            .collection('assignments')
            .find({ teamId, releaseId: cloneFromId }, { session })
            .toArray();

          if (sourceAssignments.length > 0) {
            const now3 = new Date();
            const newAssignmentDocs = sourceAssignments.map(
              ({
                _id,
                releaseId: _srcRId,
                createdAt: _ca,
                updatedAt: _ua,
                ...rest
              }) => ({
                ...rest,
                releaseId,
                createdAt: now3,
                updatedAt: now3,
              }),
            );
            await db
              .collection('assignments')
              .insertMany(newAssignmentDocs, { session });
          }
        }

        await appendEvent(db, teamId, {
          category: AUDIT_CATEGORY.RELEASE,
          action: AUDIT_ACTION.CLONE,
          releaseId,
          environment: null,
          caseId: null,
          by: actor ?? null,
          at: now,
        });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }

  return { ok: true, id: releaseId };
}

// ---------------------------------------------------------------------------
// Update (name + archived only)
// ---------------------------------------------------------------------------

/**
 * Updates a release's name and/or archived flag.
 *
 * - Renaming is rejected when another release in the team already uses the name.
 * - The `archived` flag cannot be toggled while the release is mid-mutation
 *   (regular update logic). However, archiving/unarchiving is a direct toggle:
 *   we allow setting `archived` from either direction.
 * - All other mutations on an archived release (name change) are rejected.
 *
 * Emits ARCHIVE or UNARCHIVE event when `archived` changes; emits EDIT otherwise.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {{ name?: string, archived?: boolean }} patch
 * @param {{ actor?: string }} [opts]
 * @returns {Promise<{ ok: boolean }>}
 * @see {@link lib/__tests__/db/releasesData.test.js}
 */
export async function updateRelease(
  db,
  teamId,
  releaseId,
  patch,
  { actor } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const release = await requireRelease(db, teamId, releaseId);

  const archivingToggle =
    'archived' in patch && patch.archived !== release.archived;
  const renamingWhileArchived =
    'name' in patch && release.archived && !archivingToggle;

  // Disallow name changes on a frozen (archived) release
  if (renamingWhileArchived) {
    throw new ApiError(409, 'This release is archived and cannot be modified');
  }

  const update = { updatedAt: new Date() };

  if ('name' in patch) {
    const cleanName = parseField(releaseNameSchema, patch.name);

    // Name uniqueness within team (exclude self)
    const conflict = await db
      .collection('releases')
      .findOne({ teamId, name: cleanName, _id: { $ne: releaseId } });
    if (conflict) {
      throw new ApiError(409, `A release named "${cleanName}" already exists`);
    }
    update.name = cleanName;
  }

  if ('archived' in patch) {
    update.archived = Boolean(patch.archived);
  }

  await db
    .collection('releases')
    .updateOne({ _id: releaseId, teamId }, { $set: update });

  // Emit the appropriate audit event
  let action = AUDIT_ACTION.UPDATE;
  if (archivingToggle) {
    action = patch.archived ? AUDIT_ACTION.ARCHIVE : AUDIT_ACTION.UNARCHIVE;
  }

  await appendEvent(db, teamId, {
    category: AUDIT_CATEGORY.RELEASE,
    action,
    releaseId,
    environment: null,
    caseId: null,
    by: actor ?? null,
    at: update.updatedAt,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Add / Remove environment
// ---------------------------------------------------------------------------

/**
 * Adds a new environment to a release. Normalises the name (uppercase + trim).
 * Throws 409 if it is already declared. Fans out a Pending result row per
 * existing test case in a transaction (A6).
 *
 * Rejected when the release is archived.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} environment
 * @param {{ actor?: string }} [opts]
 * @returns {Promise<{ ok: boolean }>}
 * @see {@link lib/__tests__/db/releasesData.test.js}
 */
export async function addEnvironment(
  db,
  teamId,
  releaseId,
  environment,
  { actor } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const normEnv = normaliseEnv(parseField(environmentNameSchema, environment));

  const client = await getClient();
  const session = client.startSession();

  try {
    await session.withTransaction(
      async () => {
        const release = await requireRelease(db, teamId, releaseId, session);
        assertNotArchived(release);

        if (release.environments.includes(normEnv)) {
          throw new ApiError(
            409,
            `Environment "${normEnv}" is already declared by this release`,
          );
        }

        // Append to environments list
        await db.collection('releases').updateOne(
          { _id: releaseId, teamId },
          {
            $push: { environments: normEnv },
            $set: { updatedAt: new Date() },
          },
          { session },
        );

        // Fan out Pending results for all existing cases in this release
        const existingCases = await db
          .collection('testCases')
          .find({ teamId, releaseId }, { projection: { caseId: 1 }, session })
          .toArray();

        const caseIds = existingCases.map((tc) => tc.caseId).filter(Boolean);

        const now = new Date();

        if (caseIds.length > 0) {
          const resultDocs = caseIds.map((caseId) => ({
            teamId,
            releaseId,
            caseId,
            environment: normEnv,
            status: STATUS.PENDING,
            testedBy: null,
            testedOn: null,
            notes: null,
            createdAt: now,
            updatedAt: now,
          }));

          await db.collection('testResults').insertMany(resultDocs, {
            ordered: false,
            session,
          });
        }

        await appendEvent(db, teamId, {
          category: AUDIT_CATEGORY.RELEASE,
          action: AUDIT_ACTION.ADD_ENVIRONMENT,
          releaseId,
          environment: normEnv,
          caseId: null,
          by: actor ?? null,
          at: now,
        });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }

  return { ok: true };
}

/**
 * Removes an environment from a release. Cascades:
 *   - Deletes all `testResults` rows for that environment in the release.
 *   - Deletes all environment-scoped `assignments` for that environment.
 *   - Release-wide assignments (`environment: null`) are untouched.
 *
 * A release must retain at least one environment; the last one cannot be removed.
 * Rejected when the release is archived.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} environment
 * @param {{ actor?: string }} [opts]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function removeEnvironment(
  db,
  teamId,
  releaseId,
  environment,
  { actor } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!environment?.trim()) throw new ApiError(400, 'environment is required');

  const normEnv = normaliseEnv(environment);

  const client = await getClient();
  const session = client.startSession();

  try {
    await session.withTransaction(
      async () => {
        const release = await requireRelease(db, teamId, releaseId, session);
        assertNotArchived(release);

        if (!release.environments.includes(normEnv)) {
          throw new ApiError(
            400,
            `Environment "${normEnv}" is not declared by this release`,
          );
        }

        if (release.environments.length <= 1) {
          throw new ApiError(
            400,
            'A release must have at least one environment; add another before removing this one',
          );
        }

        // Remove from environments list
        await db.collection('releases').updateOne(
          { _id: releaseId, teamId },
          {
            $pull: { environments: normEnv },
            $set: { updatedAt: new Date() },
          },
          { session },
        );

        // Cascade: delete results for this environment
        await db
          .collection('testResults')
          .deleteMany({ teamId, releaseId, environment: normEnv }, { session });

        // Cascade: delete environment-scoped assignments only
        await db
          .collection('assignments')
          .deleteMany({ teamId, releaseId, environment: normEnv }, { session });

        const now = new Date();
        await appendEvent(db, teamId, {
          category: AUDIT_CATEGORY.RELEASE,
          action: AUDIT_ACTION.REMOVE_ENVIRONMENT,
          releaseId,
          environment: normEnv,
          caseId: null,
          by: actor ?? null,
          at: now,
        });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete release (transactional cascade)
// ---------------------------------------------------------------------------

/**
 * Deletes a release and all data scoped to it:
 *   - All `testCases` for the release.
 *   - All `testResults` for the release.
 *   - All `assignments` for the release.
 *   - All `events` in CASCADE_CATEGORIES scoped to the release.
 *
 * Rejected when the release is archived (must unarchive first).
 * All operations run inside a single multi-document transaction.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {{ actor?: string }} [opts]
 * @returns {Promise<{ ok: boolean }>}
 */
export async function deleteRelease(db, teamId, releaseId, { actor } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const client = await getClient();
  const session = client.startSession();

  try {
    await session.withTransaction(
      async () => {
        const release = await requireRelease(db, teamId, releaseId, session);
        assertNotArchived(release);

        // Cascade deletes — all at once, then the release itself last.
        await Promise.all([
          db
            .collection('testCases')
            .deleteMany({ teamId, releaseId }, { session }),
          db
            .collection('testResults')
            .deleteMany({ teamId, releaseId }, { session }),
          db
            .collection('assignments')
            .deleteMany({ teamId, releaseId }, { session }),
          db.collection('events').deleteMany(
            {
              teamId,
              releaseId,
              category: { $in: [...CASCADE_CATEGORIES] },
            },
            { session },
          ),
        ]);

        await db
          .collection('releases')
          .deleteOne({ _id: releaseId, teamId }, { session });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }

  // Append a DELETE audit event after the transaction so it is not caught
  // by the cascade; this is the permanent record of who deleted the release.
  await appendEvent(db, teamId, {
    category: AUDIT_CATEGORY.RELEASE,
    action: AUDIT_ACTION.DELETE,
    releaseId,
    environment: null,
    caseId: null,
    by: actor ?? null,
    at: new Date(),
  });

  return { ok: true };
}
