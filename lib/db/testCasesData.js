import { ObjectId } from 'mongodb';
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  STATUS,
  UNASSIGNED_SENTINEL,
} from '@/lib/constants';
import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { appendEvent } from '@/lib/db/eventsData';
import { idMatch } from '@/lib/db/idQuery';
import { mintTestKey } from '@/lib/db/sequences';
import { generateDenseResults } from '@/lib/db/testResultsData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';
import { getClient } from '@/lib/mongodb';

const PATCH_ALLOWED_FIELDS = [
  'priority',
  'jiraStory',
  'externalCaseId',
  'type',
  'traceability',
  'testCase',
  'preconditions',
  'steps',
  'expectedResult',
  'applicationId',
  'moduleId',
];

const EDIT_FIELD_LABELS = Object.freeze({
  priority: 'Priority',
  jiraStory: 'Jira Story',
  externalCaseId: 'External Case ID',
  type: 'Type',
  traceability: 'Traceability',
  testCase: 'Description',
  preconditions: 'Preconditions',
  steps: 'Steps',
  expectedResult: 'Expected Result',
  applicationId: 'Application',
  moduleId: 'Module',
});

function toAuditDisplayValue(field, value, appMap, modMap) {
  if (!value) return null;
  if (field === 'applicationId') return appMap?.[value] || value;
  if (field === 'moduleId') return modMap?.[value] || value;
  return value;
}

/**
 * Builds the definition-only filters for the testCases collection. Status,
 * testedBy, and assignedTo live on testResults and are filtered there (see
 * buildResultsFilter), not here.
 */
function buildDefinitionMatch(teamId, filters) {
  const match = { teamId };
  if (filters.applicationId) match.applicationId = filters.applicationId;
  if (filters.moduleId) match.moduleId = filters.moduleId;
  if (filters.priority) match.priority = filters.priority;
  if (filters.testKey) match.testKey = filters.testKey;
  if (filters.jiraStory)
    match.jiraStory = { $regex: filters.jiraStory, $options: 'i' };
  if (filters.testCase)
    match.testCase = { $regex: filters.testCase, $options: 'i' };
  return match;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchSpec(filters, applications, modules) {
  const q = filters.q?.trim();
  if (!q) return null;

  const regex = { $regex: escapeRegex(q), $options: 'i' };
  const applicationIds = applications
    .filter(
      (app) => regex.$regex && new RegExp(regex.$regex, 'i').test(app.name),
    )
    .map((app) => app._id.toString());
  const moduleIds = modules
    .filter(
      (mod) => regex.$regex && new RegExp(regex.$regex, 'i').test(mod.name),
    )
    .map((mod) => mod._id.toString());

  return { regex, applicationIds, moduleIds };
}

function buildScopedSearchMatch(searchSpec) {
  if (!searchSpec) return null;

  const clauses = [
    { '_tcDoc.testCase': searchSpec.regex },
    { '_tcDoc.testKey': searchSpec.regex },
    { assignedTo: searchSpec.regex },
  ];

  if (searchSpec.applicationIds.length > 0) {
    clauses.push({
      '_tcDoc.applicationId': { $in: searchSpec.applicationIds },
    });
  }
  if (searchSpec.moduleIds.length > 0) {
    clauses.push({ '_tcDoc.moduleId': { $in: searchSpec.moduleIds } });
  }

  return { $match: { $or: clauses } };
}

function buildUnscopedSearchMatch(searchSpec) {
  if (!searchSpec) return null;

  const clauses = [
    { testCase: searchSpec.regex },
    { testKey: searchSpec.regex },
  ];

  if (searchSpec.applicationIds.length > 0) {
    clauses.push({ applicationId: { $in: searchSpec.applicationIds } });
  }
  if (searchSpec.moduleIds.length > 0) {
    clauses.push({ moduleId: { $in: searchSpec.moduleIds } });
  }

  return { $match: { $or: clauses } };
}

function normalizeSort(filters, scoped) {
  const sortBy = filters.sortBy || 'createdAt';
  const sortDir = filters.sortDir === 'desc' ? -1 : 1;

  if (sortBy === 'testCase') {
    return {
      addFields: {
        _sortValue: {
          $toLower: {
            $ifNull: [scoped ? '$_tcDoc.testCase' : '$testCase', ''],
          },
        },
      },
      sort: { _sortValue: sortDir, _createdAt: 1 },
    };
  }

  if (sortBy === 'assignedTo' && scoped) {
    return {
      addFields: {
        _sortValue: {
          $toLower: { $ifNull: ['$assignedTo', ''] },
        },
      },
      sort: { _sortValue: sortDir, _createdAt: 1 },
    };
  }

  return {
    addFields: {},
    sort: { _createdAt: sortDir },
  };
}

/**
 * Builds a $match fragment against the execution-state fields (status,
 * testedBy, assignedTo) as stored natively on testResults. Merged into the
 * scoped pipeline's first stage so the filter runs before any join.
 * Returns null when no execution-state filters are active.
 */
function buildResultsFilter(filters) {
  const filter = {};

  // status — comma-separated OR
  if (filters.status) {
    const vals = filters.status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (vals.length > 0) {
      filter.status = vals.length === 1 ? vals[0] : { $in: vals };
    }
  }

  // testedBy
  if (filters.testedBy === UNASSIGNED_SENTINEL) {
    filter.$or = [
      ...(filter.$or || []),
      { testedBy: null },
      { testedBy: '' },
      { testedBy: { $exists: false } },
    ];
  } else if (filters.testedBy) {
    filter.testedBy = filters.testedBy;
  }

  // assignedTo
  if (filters.assignedTo === UNASSIGNED_SENTINEL) {
    // merge into $or or create one; we need all of the below to match "unassigned"
    const unassignedClauses = [
      { assignedTo: null },
      { assignedTo: '' },
      { assignedTo: { $exists: false } },
    ];
    if (filter.$or) {
      // Already have $or from testedBy sentinel — wrap in $and
      const existing$or = filter.$or;
      delete filter.$or;
      filter.$and = [{ $or: existing$or }, { $or: unassignedClauses }];
    } else if (filter.$and) {
      filter.$and.push({ $or: unassignedClauses });
    } else {
      filter.$or = unassignedClauses;
    }
  } else if (filters.assignedTo) {
    filter.assignedTo = filters.assignedTo;
  }

  return Object.keys(filter).length > 0 ? filter : null;
}

/**
 * Builds the aggregation pipeline for a release-scoped listing.
 *
 * Drives from `testResults` so the execution-state filters (status/testedBy/
 * assignedTo — all native to that collection) and the (teamId, releaseId,
 * environment) scope cut the working set in the FIRST stage, before any join.
 * `testResults` is dense (one row per case × environment), so the inner join to
 * `testCases` never drops a case.
 *
 * Documents stay lean through the blocking $sort: the pre-sort $lookup projects
 * only `createdAt`, and the full case document is fetched only for the paginated
 * slice inside the $facet. This keeps the in-memory sort footprint proportional
 * to (matched rows × a few small fields), not (matched rows × full case docs).
 *
 *   1. $match     — testResults: scope + execution-state filters (index-backed)
 *   2. $lookup    — testCases: definition filters + createdAt only (lean, inner)
 *   3. $match     — drop result rows whose case was filtered out / orphaned
 *   4. $addFields — hoist createdAt as the sort key
 *   5. $sort      — over lean docs
 *   6. $facet     — count + [skip, limit, full-doc lookup for the page slice]
 */
function buildScopedPipeline({
  teamId,
  releaseId,
  environment,
  definitionMatch,
  resultsFilter,
  searchSpec,
  sort,
  skip,
  limit,
}) {
  const pipeline = [
    { $match: { teamId, releaseId, environment, ...(resultsFilter || {}) } },
    {
      $lookup: {
        from: 'testCases',
        let: { tcOid: { $toObjectId: '$tcId' } },
        pipeline: [
          {
            $match: { $expr: { $eq: ['$_id', '$$tcOid'] }, ...definitionMatch },
          },
          {
            $project: {
              createdAt: 1,
              testCase: 1,
              testKey: 1,
              applicationId: 1,
              moduleId: 1,
            },
          },
        ],
        as: '_tc',
      },
    },
    { $match: { '_tc.0': { $exists: true } } },
    {
      $addFields: {
        _tcDoc: { $arrayElemAt: ['$_tc', 0] },
        _createdAt: { $arrayElemAt: ['$_tc.createdAt', 0] },
      },
    },
  ];

  const searchMatch = buildScopedSearchMatch(searchSpec);
  if (searchMatch) pipeline.push(searchMatch);

  pipeline.push(
    { $addFields: sort.addFields },
    { $sort: sort.sort },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'testCases',
              let: { tcOid: { $toObjectId: '$tcId' } },
              pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$tcOid'] } } }],
              as: '_full',
            },
          },
          // Merge the case definition as the base row, overlaying the execution
          // state carried up from the driving testResults document.
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: [
                  { $arrayElemAt: ['$_full', 0] },
                  {
                    status: '$status',
                    testedBy: '$testedBy',
                    assignedTo: '$assignedTo',
                  },
                ],
              },
            },
          },
        ],
      },
    },
  );

  return pipeline;
}

/**
 * Builds the aggregation pipeline for an unscoped listing (no release context,
 * e.g. the initial SSR page load). There is no execution state to overlay, so
 * every case is implicitly Pending and the query never touches `testResults` —
 * a plain definition match + index-backed sort + paginate.
 */
function buildUnscopedPipeline({
  definitionMatch,
  searchSpec,
  sort,
  skip,
  limit,
}) {
  const pipeline = [{ $match: definitionMatch }];

  const searchMatch = buildUnscopedSearchMatch(searchSpec);
  if (searchMatch) pipeline.push(searchMatch);

  pipeline.push(
    { $addFields: { _createdAt: '$createdAt', ...sort.addFields } },
    { $sort: sort.sort },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  );

  return pipeline;
}

/**
 * List test cases for a team with optional filters. When a (releaseId,
 * environment) scope is supplied the rows are joined to their testResults
 * execution state (status/testedBy/assignedTo); otherwise every case is Pending.
 *
 * Always fetches the app/mod maps and enriches each row with
 * applicationName/moduleName. The `applications` and `modules` arrays
 * are included in the response only when `filters.includeMeta` is truthy.
 *
 * @see {@link ../__tests__/db/testCasesData.test.js}
 */
export async function listTestCases(db, teamId, filters = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const { releaseId, environment } = filters;
  const page = Math.max(1, parseInt(filters.page || '1', 10));
  const limit = Math.min(200, Math.max(1, parseInt(filters.limit || '50', 10)));
  const skip = (page - 1) * limit;

  const definitionMatch = buildDefinitionMatch(teamId, filters);
  const scoped = Boolean(releaseId && environment);
  const { appMap, modMap, applications, modules } = await fetchAppModMaps(
    db,
    teamId,
  );
  const searchSpec = buildSearchSpec(filters, applications, modules);
  const sort = normalizeSort(filters, scoped);

  const pipeline = scoped
    ? buildScopedPipeline({
        teamId,
        releaseId,
        environment,
        definitionMatch,
        resultsFilter: buildResultsFilter(filters),
        searchSpec,
        sort,
        skip,
        limit,
      })
    : buildUnscopedPipeline({ definitionMatch, searchSpec, sort, skip, limit });

  const collection = scoped ? 'testResults' : 'testCases';

  const [facetResult] = await db
    .collection(collection)
    .aggregate(pipeline, { allowDiskUse: true })
    .toArray();

  const total = facetResult?.metadata?.[0]?.total ?? 0;
  const rawDocs = facetResult?.data ?? [];

  const data = rawDocs.map((tc) => ({
    ...toClientDoc(tc),
    applicationName: appMap[tc.applicationId] || 'Unknown',
    moduleName: modMap[tc.moduleId] || 'Unknown',
    // Normalize any legacy empty-string status to the canonical PENDING constant
    status: tc.status || STATUS.PENDING,
    // Unscoped listings carry no execution state — default to unassigned
    testedBy: tc.testedBy ?? null,
    assignedTo: tc.assignedTo ?? null,
  }));

  const result = {
    data,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };

  if (filters.includeMeta) {
    result.applications = applications.map((a) => ({
      _id: a._id.toString(),
      name: a.name,
    }));
    result.modules = modules.map((m) => ({
      _id: m._id.toString(),
      name: m.name,
      applicationId: m.applicationId?.toString() || '',
    }));
  }

  return result;
}

/**
 * Returns a single test case joined to its testResults row for the given
 * (releaseId, environment), overlaying status/testedBy/assignedTo.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} id - ObjectId string of the test case
 * @param {{ releaseId?: string, environment?: string }} [opts]
 */
export async function getTestCase(
  db,
  teamId,
  id,
  { releaseId, environment } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid id');
  }

  const [tc, resultRow, { appMap, modMap }] = await Promise.all([
    db.collection('testCases').findOne({ _id: idMatch(id), teamId }),
    releaseId && environment
      ? db
          .collection('testResults')
          .findOne({ teamId, releaseId, tcId: id, environment })
      : Promise.resolve(null),
    fetchAppModMaps(db, teamId),
  ]);

  if (!tc) throw new ApiError(404, 'Test case not found');

  return {
    ...toClientDoc(tc),
    applicationName: appMap[tc.applicationId] || 'Unknown',
    moduleName: modMap[tc.moduleId] || 'Unknown',
    status: resultRow?.status || STATUS.PENDING,
    testedBy: resultRow?.testedBy ?? null,
    assignedTo: resultRow?.assignedTo ?? null,
  };
}

/**
 * @see {@link ../../lib/__tests__/db/testCasesData.test.js}
 */
export async function createTestCase(db, teamId, body) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const { applicationId, moduleId, releaseId, ...fields } = body;
  if (!moduleId) {
    throw new ApiError(400, 'moduleId required');
  }

  // applicationId is optional at this layer: when present it drives testKey
  // minting below; the HTTP route schema still requires it for API callers.
  let testKey;
  if (applicationId) {
    const app = await db
      .collection('applications')
      .findOne({ _id: idMatch(applicationId) }, { projection: { initial: 1 } });
    if (app?.initial) {
      testKey = await mintTestKey(db, applicationId, app.initial);
    }
  }

  const doc = {
    teamId,
    ...(applicationId ? { applicationId } : {}),
    moduleId,
    type: fields.type || '',
    traceability: fields.traceability || '',
    externalCaseId: fields.externalCaseId || '',
    testCase: fields.testCase || '',
    preconditions: fields.preconditions || '',
    steps: fields.steps || '',
    expectedResult: fields.expectedResult || '',
    priority: fields.priority || '',
    jiraStory: fields.jiraStory || '',
    source: fields.source === 'ai' ? 'ai' : 'manual',
    ...(testKey ? { testKey } : {}),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const insertResult = await db.collection('testCases').insertOne(doc);
  const newTcId = insertResult.insertedId.toString();

  // Fan out dense Pending result rows for the new case across all environments
  // the release declares. Skips silently if releaseId is absent (e.g. test harness).
  if (releaseId) {
    await generateDenseResults(db, teamId, releaseId, [newTcId]);
  }

  return { ok: true, id: newTcId };
}

/**
 * @see {@link ../../lib/__tests__/db/testCasesData.test.js}
 */
export async function updateTestCase(
  db,
  teamId,
  id,
  body,
  { actor, releaseId } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const update = {};
  for (const field of PATCH_ALLOWED_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  update.updatedAt = new Date();

  // R9 — cannot blank core content fields
  if ('testCase' in body && !body.testCase?.trim())
    throw new ApiError(400, 'testCase cannot be blank');
  if ('expectedResult' in body && !body.expectedResult?.trim())
    throw new ApiError(400, 'expectedResult cannot be blank');

  const existing = await db.collection('testCases').findOne({
    _id: idMatch(id),
    teamId,
  });
  if (!existing) throw new ApiError(404, 'Test case not found');

  const needsAppModMaps =
    ('applicationId' in update &&
      update.applicationId !== existing.applicationId) ||
    ('moduleId' in update && update.moduleId !== existing.moduleId);
  const { appMap, modMap } = needsAppModMaps
    ? await fetchAppModMaps(db, teamId)
    : { appMap: null, modMap: null };

  const changes = [];
  for (const field of PATCH_ALLOWED_FIELDS) {
    if (!(field in update)) continue;
    const before = existing[field] ?? null;
    const after = update[field] ?? null;
    if (before === after) continue;
    changes.push({
      field,
      label: EDIT_FIELD_LABELS[field] || field,
      before: toAuditDisplayValue(field, before, appMap, modMap),
      after: toAuditDisplayValue(field, after, appMap, modMap),
    });
  }

  const { matchedCount } = await db
    .collection('testCases')
    .updateOne({ _id: idMatch(id), teamId }, { $set: update });

  if (matchedCount === 0) throw new ApiError(404, 'Test case not found');

  if (changes.length > 0) {
    await appendEvent(db, teamId, {
      category: AUDIT_CATEGORY.TEST_CASE,
      action: AUDIT_ACTION.EDIT,
      tcId: id,
      releaseId: releaseId ?? existing.releaseId ?? null,
      environment: null,
      by: actor ?? null,
      at: update.updatedAt,
      changes,
      adminSurface: true,
    });
  }

  return { ok: true };
}

/**
 * Deletes a single test case and cascades to its results and assignments.
 * The entire operation runs in a transaction.
 *
 * Throws 400 when `teamId` is falsy or `id` is not a valid ObjectId.
 * Throws 404 when the test case does not exist or belongs to a different team.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} id - ObjectId string of the test case
 * @param {{ actor?: string }} [opts]
 * @returns {Promise<{ ok: boolean }>}
 * @see {@link ../../lib/__tests__/db/testCasesData.test.js}
 */
export async function deleteTestCase(db, teamId, id, { actor } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    throw new ApiError(400, 'Invalid id');
  }

  const client = await getClient();
  const session = client.startSession();

  let tcId;
  try {
    await session.withTransaction(
      async () => {
        const tc = await db
          .collection('testCases')
          .findOne({ _id: oid, teamId }, { session });
        if (!tc) throw new ApiError(404, 'Test case not found');

        tcId = tc._id.toString();

        await Promise.all([
          db
            .collection('testResults')
            .deleteMany({ teamId, tcId }, { session }),
          db.collection('events').deleteMany({ teamId, tcId }, { session }),
        ]);

        await db
          .collection('testCases')
          .deleteOne({ _id: oid, teamId }, { session });
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }

  await appendEvent(db, teamId, {
    category: AUDIT_CATEGORY.TEST_CASE,
    action: AUDIT_ACTION.DELETE,
    tcId,
    releaseId: null,
    environment: null,
    by: actor ?? null,
    at: new Date(),
    adminSurface: true,
  });

  return { ok: true };
}

/**
 * Counts test cases per application and per module for a release. Definition
 * counts (environment-independent) backing the Bulk Assign scope picker.
 *
 * @returns {Promise<{ byApplication: Record<string, number>, byModule: Record<string, number> }>}
 */
export async function countCasesByScope(db, teamId, releaseId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');

  const rows = await db
    .collection('testCases')
    .aggregate([
      { $match: { teamId, releaseId } },
      {
        $group: {
          _id: { app: '$applicationId', mod: '$moduleId' },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const byApplication = {};
  const byModule = {};
  for (const r of rows) {
    if (r._id.app)
      byApplication[r._id.app] = (byApplication[r._id.app] ?? 0) + r.n;
    if (r._id.mod) byModule[r._id.mod] = (byModule[r._id.mod] ?? 0) + r.n;
  }
  return { byApplication, byModule };
}

/**
 * Aggressively normalizes a title for duplicate comparison: lowercase and strip
 * all non-alphanumeric characters (spaces, punctuation, apostrophes). This
 * collapses variations like "SuperAdmin" vs "Super Admin" or "don't" vs "dont"
 * into the same token so near-identical AI-generated titles are caught.
 */
function normalizeForDuplicate(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds existing test cases in the same applicationId + moduleId scope whose
 * aggressively-normalized title matches the supplied value. Same title in a
 * different application or module is intentional and is NOT flagged.
 *
 * Returns an empty array immediately when teamId, applicationId, moduleId, or
 * testCase (after stripping non-alphanumerics) is blank.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ testCase: string, applicationId: string, moduleId: string }} fields
 * @returns {Promise<Array<{ id: string, testCase: string, testKey: string|null }>>}
 */
export async function findPotentialDuplicates(
  db,
  teamId,
  { testCase, applicationId, moduleId },
) {
  if (!teamId || !applicationId || !moduleId || !testCase) return [];
  const normalizedTitle = normalizeForDuplicate(testCase);
  if (!normalizedTitle) return [];

  const candidates = await db
    .collection('testCases')
    .find(
      { teamId, applicationId, moduleId },
      { projection: { _id: 1, testCase: 1, testKey: 1 } },
    )
    .toArray();

  return candidates
    .filter((tc) => normalizeForDuplicate(tc.testCase) === normalizedTitle)
    .map((tc) => ({
      id: tc._id.toString(),
      testCase: tc.testCase,
      testKey: tc.testKey ?? null,
    }));
}

export async function resetTeamData(db, teamId) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const [testCases, modules, applications, events] = await Promise.all([
    db.collection('testCases').deleteMany({ teamId }),
    db.collection('modules').deleteMany({ teamId }),
    db.collection('applications').deleteMany({ teamId }),
    db.collection('events').deleteMany({ teamId }),
  ]);

  return {
    testCases: testCases.deletedCount,
    modules: modules.deletedCount,
    applications: applications.deletedCount,
    events: events.deletedCount,
  };
}

/**
 * Lists test cases that were created by the AI generator (source === 'ai').
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ page?: string|number, pageSize?: string|number, search?: string, appId?: string, moduleId?: string }} [filters]
 */
export async function getAiGeneratedTestCases(
  db,
  teamId,
  { page = 1, pageSize = 20, search = '', appId = '', moduleId = '' } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const p = Math.max(1, parseInt(page || '1', 10));
  const limit = Math.min(Number(pageSize) || 20, 100);
  const skip = (p - 1) * limit;

  const match = { teamId, source: 'ai' };
  if (appId) match.applicationId = appId;
  if (moduleId) match.moduleId = moduleId;
  if (search) {
    const re = { $regex: escapeRegex(search), $options: 'i' };
    match.$or = [{ testCase: re }, { testKey: re }];
  }

  const [rawCases, total, { appMap, modMap }] = await Promise.all([
    db
      .collection('testCases')
      .find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .project({
        testCase: 1,
        testKey: 1,
        applicationId: 1,
        moduleId: 1,
        jiraStory: 1,
        createdAt: 1,
        priority: 1,
        type: 1,
        preconditions: 1,
        steps: 1,
        expectedResult: 1,
        traceability: 1,
      })
      .toArray(),
    db.collection('testCases').countDocuments(match),
    fetchAppModMaps(db, teamId),
  ]);

  const cases = rawCases.map((tc) => ({
    ...toClientDoc(tc),
    applicationName: appMap[tc.applicationId] || 'Unknown',
    moduleName: modMap[tc.moduleId] || 'Unknown',
  }));

  return {
    cases,
    total,
    page: p,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Returns all test cases for a team linked to a given jiraStory key.
 * Projected to only the fields needed for AI impact analysis.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} storyKey
 */
export async function getTestCasesByStory(db, teamId, storyKey) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!storyKey) throw new ApiError(400, 'storyKey required');

  const docs = await db
    .collection('testCases')
    .find(
      { teamId, jiraStory: storyKey },
      {
        projection: {
          _id: 1,
          testKey: 1,
          testCase: 1,
          preconditions: 1,
          steps: 1,
          expectedResult: 1,
          priority: 1,
          type: 1,
          applicationId: 1,
          moduleId: 1,
        },
      },
    )
    .toArray();

  return docs.map(toClientDoc);
}
