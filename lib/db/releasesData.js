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
// Latest release
// ---------------------------------------------------------------------------

/**
 * Returns the most-recently-created non-archived release for the team, or null
 * when none exist.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @returns {Promise<object|null>}
 */
export async function getLatestRelease(db, teamId) {
  if (!teamId) return null;
  const doc = await db
    .collection('releases')
    .findOne({ teamId, archived: { $ne: true } }, { sort: { createdAt: -1 } });
  return doc ? toClientDoc(doc) : null;
}

/**
 * Resolves the active (releaseId, environment) for server rendering. Validates
 * a stored selection (from the release-context cookie) against the team's live,
 * non-archived releases; falls back to the latest release and its first
 * environment when the stored selection is absent, archived, or stale.
 *
 * Mirrors the client-side validation in ReleaseEnvContext so server and client
 * agree on the active selection (no flash, no hydration mismatch).
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId?: string, environment?: string }|null} stored
 * @returns {Promise<{ releaseId: string|null, environment: string|null }>}
 */
export async function resolveActiveReleaseEnv(db, teamId, stored) {
  if (!teamId) return { releaseId: null, environment: null };

  if (stored?.releaseId && stored?.environment) {
    const release = await db
      .collection('releases')
      .findOne({ _id: stored.releaseId, teamId, archived: { $ne: true } });
    if (release?.environments?.includes(stored.environment)) {
      return { releaseId: stored.releaseId, environment: stored.environment };
    }
  }

  const latest = await getLatestRelease(db, teamId);
  return {
    releaseId: latest?._id ?? null,
    environment: latest?.environments?.[0] ?? null,
  };
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
 *   release into the new one, keeping their `testKey`. Pending
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
      tcId: null,
      by: actor ?? null,
      at: now,
      subject: cleanName,
      adminSurface: true,
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

        // Copy test cases from the source release — keep testKey for lineage,
        // strip old _id so MongoDB assigns new ObjectIds, point to the new releaseId.
        // Strip execution fields (status, testedBy, testedOn, notes) so no legacy
        // execution state contaminates the clone (§3.5).
        const sourceCases = await db
          .collection('testCases')
          .find({ teamId, releaseId: cloneFromId }, { session })
          .toArray();

        const now2 = new Date();
        // srcTcId -> newTcId mapping; used to rekey carried assignments.
        const tcIdMap = new Map();
        let tcIds = [];

        if (sourceCases.length > 0) {
          // Strip _id, releaseId, timestamps, and execution fields so the cloned
          // definition documents contain only definition content.
          const newCaseDocs = sourceCases.map(
            ({
              _id,
              releaseId: _srcReleaseId,
              createdAt: _ca,
              updatedAt: _ua,
              status: _status,
              testedBy: _testedBy,
              testedOn: _testedOn,
              notes: _notes,
              ...rest
            }) => ({
              ...rest,
              releaseId,
              createdAt: now2,
              updatedAt: now2,
            }),
          );

          const insertResult = await db
            .collection('testCases')
            .insertMany(newCaseDocs, { session });

          // Use the newly-assigned _ids (not source-doc _ids) so result rows key
          // off the fresh documents in this release, not the lineage identifiers.
          // Index into insertedIds by insertion position rather than relying on
          // Object.values enumeration order.
          tcIds = newCaseDocs.map((_, i) =>
            insertResult.insertedIds[i].toString(),
          );

          // Build source→new tcId mapping for assignment carry-forward.
          sourceCases.forEach((sc, i) => {
            tcIdMap.set(sc._id.toString(), tcIds[i]);
          });

          // Generate dense Pending results for all cloned cases × environments
          // generateDenseResults reads environments from the release we just inserted
          if (tcIds.length > 0) {
            await generateDenseResults(db, teamId, releaseId, tcIds, session);
          }
        }

        // Optionally carry assignments, re-keyed to the new tcIds.
        // Source is the prior release's testResults (assignedTo field); the
        // assignments collection is no longer used (§3.5 elimination).
        if (carryAssignments) {
          const sourceResults = await db
            .collection('testResults')
            .find(
              { teamId, releaseId: cloneFromId, assignedTo: { $ne: null } },
              {
                projection: { tcId: 1, environment: 1, assignedTo: 1 },
                session,
              },
            )
            .toArray();

          const now3 = new Date();
          const carried = sourceResults.filter((r) => tcIdMap.has(r.tcId));
          for (const r of carried) {
            await db.collection('testResults').updateMany(
              {
                teamId,
                releaseId,
                tcId: tcIdMap.get(r.tcId),
                environment: r.environment,
              },
              { $set: { assignedTo: r.assignedTo } },
              { session },
            );
          }
          if (carried.length) {
            await db.collection('events').insertMany(
              carried.map((r) => ({
                teamId,
                category: AUDIT_CATEGORY.ASSIGNMENT,
                action: AUDIT_ACTION.ASSIGN,
                tcId: tcIdMap.get(r.tcId),
                releaseId,
                environment: r.environment,
                assignedTo: r.assignedTo,
                by: null,
                at: now3,
              })),
              { session },
            );
          }
        }

        await appendEvent(db, teamId, {
          category: AUDIT_CATEGORY.RELEASE,
          action: AUDIT_ACTION.CLONE,
          releaseId,
          environment: null,
          tcId: null,
          by: actor ?? null,
          at: now,
          subject: cleanName,
          adminSurface: true,
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
    tcId: null,
    by: actor ?? null,
    at: update.updatedAt,
    subject: update.name ?? release.name,
    adminSurface: true,
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
          .find({ teamId, releaseId }, { projection: { _id: 1 }, session })
          .toArray();

        const tcIds = existingCases.map((tc) => tc._id.toString());

        const now = new Date();

        if (tcIds.length > 0) {
          const resultDocs = tcIds.map((tcId) => ({
            teamId,
            releaseId,
            tcId,
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
          tcId: null,
          by: actor ?? null,
          at: now,
          subject: release.name,
          adminSurface: true,
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
 *   - Deletes all ASSIGNMENT `events` scoped to that environment.
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

        // Cascade: delete environment-scoped assignment history.
        await db.collection('events').deleteMany(
          {
            teamId,
            releaseId,
            environment: normEnv,
            category: AUDIT_CATEGORY.ASSIGNMENT,
          },
          { session },
        );

        const now = new Date();
        await appendEvent(db, teamId, {
          category: AUDIT_CATEGORY.RELEASE,
          action: AUDIT_ACTION.REMOVE_ENVIRONMENT,
          releaseId,
          environment: normEnv,
          tcId: null,
          by: actor ?? null,
          at: now,
          subject: release.name,
          adminSurface: true,
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
 *   - All `events` in CASCADE_CATEGORIES scoped to the release (includes ASSIGNMENT history).
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
  let releaseName;

  try {
    await session.withTransaction(
      async () => {
        const release = await requireRelease(db, teamId, releaseId, session);
        assertNotArchived(release);
        releaseName = release.name;

        // Cascade deletes — all at once, then the release itself last.
        await Promise.all([
          db
            .collection('testCases')
            .deleteMany({ teamId, releaseId }, { session }),
          db
            .collection('testResults')
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
    tcId: null,
    by: actor ?? null,
    at: new Date(),
    subject: releaseName ?? null,
    adminSurface: true,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cookie-context validation
// ---------------------------------------------------------------------------

/**
 * Returns true when a non-archived release with `releaseId` exists for the team.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @returns {Promise<boolean>}
 * @see {@link lib/__tests__/db/releasesData.test.js}
 */
export async function releaseExistsForTeam(db, teamId, releaseId) {
  if (!teamId || !releaseId) return false;
  const doc = await db
    .collection('releases')
    .findOne(
      { _id: releaseId, teamId, archived: { $ne: true } },
      { projection: { _id: 1 } },
    );
  return doc !== null;
}
