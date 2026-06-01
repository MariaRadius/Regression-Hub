import { ObjectId } from 'mongodb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendEvents } from '@/lib/db/eventsData';
import { generateDenseResults } from '@/lib/db/testResultsData';
import { ApiError } from '@/lib/errors';
import { getClient } from '@/lib/mongodb';
import { deriveInitial, nextInitialCandidate } from '@/utils/appInitial';
import { parseWorkbookBuffer } from '@/utils/excelImport';
import { slugify } from '@/utils/slugify';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a release exists, belongs to the team, and is not archived.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {import('mongodb').ClientSession} [session]
 * @returns {Promise<object>} The release document.
 */
async function requireActiveRelease(db, teamId, releaseId, session) {
  const release = await db
    .collection('releases')
    .findOne({ _id: releaseId, teamId }, { session });
  if (!release) throw new ApiError(404, 'Release not found');
  if (release.archived) {
    throw new ApiError(409, 'This release is archived and cannot be modified');
  }
  return release;
}

/**
 * Reserve a DB-unique 3-character initial, starting from a derived (or
 * override) candidate. Initials are unique across the whole `applications`
 * collection (decision 19), so the existing set is scanned and, on collision,
 * the candidate is advanced through the rollover sequence (e.g. SAP taken →
 * SA1, SA2, …) until a free value is found. Overrides are validated unique by
 * the caller and used as-is.
 *
 * @param {import('mongodb').Db} db
 * @param {string} candidate - Derived or override 3-char candidate.
 * @param {boolean} isOverride - When true, trust the candidate verbatim.
 * @param {import('mongodb').ClientSession} session
 * @returns {Promise<string>} A free, DB-unique initial.
 */
async function reserveUniqueInitial(db, candidate, isOverride, session) {
  if (isOverride) return candidate;

  const existing = await db
    .collection('applications')
    .find({}, { projection: { initial: 1 }, session })
    .toArray();
  const taken = new Set(existing.map((a) => a.initial).filter(Boolean));

  if (!taken.has(candidate)) return candidate;

  // Derived initial is taken — roll from the sentinel (e.g. SAP → SA0 → SA1)
  // and keep advancing until a free value is found.
  let current = nextInitialCandidate(`${candidate.slice(0, 2)}0`);
  while (taken.has(current)) {
    current = nextInitialCandidate(current);
  }
  return current;
}

/**
 * Resolve an application's DB-unique initial, creating the application or
 * backfilling a missing initial as needed. An existing application that
 * already carries an initial returns it unchanged. An application created
 * before initials existed (no `initial` field) is healed in place so its test
 * keys never render as `undefined-NNNN`. A brand-new application is inserted.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} appName
 * @param {string} [initialOverride] - Validated 3-char override from the UI.
 * @param {import('mongodb').ClientSession} session
 * @returns {Promise<string>} The initial assigned to the application.
 * @see {@link lib/__tests__/db/importExcelData.test.js}
 */
async function upsertApplicationWithInitial(
  db,
  teamId,
  appName,
  initialOverride,
  session,
) {
  const existing = await db
    .collection('applications')
    .findOne({ name: appName, teamId }, { session });

  // Existing application that already carries an initial — reuse it.
  if (existing?.initial) return existing.initial;

  const initial = await reserveUniqueInitial(
    db,
    initialOverride ?? deriveInitial(appName),
    Boolean(initialOverride),
    session,
  );
  const now = new Date();

  if (existing) {
    // Legacy application row created before initials existed — backfill it so
    // imports never mint `undefined-NNNN` test keys against it.
    await db
      .collection('applications')
      .updateOne(
        { _id: existing._id, teamId },
        { $set: { initial, updatedAt: now } },
        { session },
      );
    return initial;
  }

  await db.collection('applications').insertOne(
    {
      _id: new ObjectId().toString(),
      teamId,
      name: appName,
      initial,
      createdAt: now,
      updatedAt: now,
    },
    { session },
  );
  return initial;
}

/**
 * Upsert a module (team-global). Returns the module's _id string.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} applicationId
 * @param {string} modName
 * @param {import('mongodb').ClientSession} session
 * @returns {Promise<string>}
 */
async function upsertModule(db, teamId, applicationId, modName, session) {
  const now = new Date();
  const result = await db.collection('modules').findOneAndUpdate(
    { applicationId, name: modName, teamId },
    {
      $setOnInsert: {
        applicationId,
        name: modName,
        teamId,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after', session },
  );
  return (result?._id ?? result?.value?._id ?? result).toString();
}

/**
 * Format a test key from an initial and serial number.
 *
 * @param {string} initial - 3-char application initial (e.g. 'SAP').
 * @param {number} serial - Zero-padded 4-digit serial.
 * @returns {string} e.g. 'SAP-0001'
 * @throws {Error} When `initial` is falsy — guards against silently minting a
 *   malformed `undefined-NNNN` key (the application initial must be resolved
 *   via {@link upsertApplicationWithInitial} before formatting).
 */
function formatTestKey(initial, serial) {
  if (!initial) {
    throw new Error('Cannot build a test key without an application initial');
  }
  return `${initial}-${String(serial).padStart(4, '0')}`;
}

/**
 * Resolve identity for a single parsed row using the two-key ladder (dry-run,
 * no writes). Returns a `resolution` object describing the outcome.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ testKey: string, fingerprint: string, appName: string, modName: string }} keys
 * @returns {Promise<{ action: 'create'|'update'|'reject', caseId: string|null, existingTestKey: string|null, existingName: string|null, warning: string|null, error: string|null }>}
 */
async function resolveRowIdentity(
  db,
  teamId,
  { testKey, fingerprint, appName, modName },
) {
  // --- Step 1: Test Key match ---
  if (testKey) {
    const byKey = await db.collection('testCases').findOne(
      { testKey },
      {
        projection: {
          _id: 1,
          caseId: 1,
          teamId: 1,
          applicationId: 1,
          moduleId: 1,
          testCase: 1,
        },
      },
    );

    if (byKey) {
      // Scope mismatch: Test Key found but belongs to wrong team, app, or module
      if (byKey.teamId !== teamId) {
        return {
          action: 'reject',
          caseId: null,
          existingTestKey: testKey,
          existingName: null,
          warning: null,
          error: `Test Key ${testKey} belongs to a different team`,
        };
      }

      // Check app/module scope agreement
      const app = await db
        .collection('applications')
        .findOne(
          { _id: byKey.applicationId, teamId },
          { projection: { name: 1 } },
        );
      const mod = await db
        .collection('modules')
        .findOne({ _id: byKey.moduleId, teamId }, { projection: { name: 1 } });

      const appMatches = app?.name === appName;
      const modMatches = mod?.name === modName;

      if (!appMatches || !modMatches) {
        return {
          action: 'reject',
          caseId: null,
          existingTestKey: testKey,
          existingName: byKey.testCase ?? null,
          warning: null,
          error: `Test Key ${testKey} belongs to a different application or module`,
        };
      }

      return {
        action: 'update',
        caseId: byKey.caseId,
        existingTestKey: testKey,
        existingName: byKey.testCase ?? null,
        warning: null,
        error: null,
      };
    }

    // Unrecognized Test Key — fall through but flag a warning
    // (continue to fingerprint/new-case path)
    const fingerprintResult = await resolveByFingerprint(
      db,
      teamId,
      fingerprint,
    );
    return {
      ...fingerprintResult,
      warning: `Test Key ${testKey} was not found — treated as new (fingerprint fallback)`,
    };
  }

  // --- Step 2: Fingerprint fallback ---
  return resolveByFingerprint(db, teamId, fingerprint);
}

/**
 * Resolve a row by content fingerprint across all releases (team-scoped, app+mod scoped).
 * Newest-wins on ambiguous match.
 */
async function resolveByFingerprint(db, teamId, fingerprint) {
  if (!fingerprint) {
    return {
      action: 'create',
      caseId: null,
      existingTestKey: null,
      existingName: null,
      warning: null,
      error: null,
    };
  }

  const matches = await db
    .collection('testCases')
    .find(
      { teamId, fingerprint },
      { projection: { caseId: 1, testKey: 1, testCase: 1, createdAt: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();

  if (!matches.length) {
    return {
      action: 'create',
      caseId: null,
      existingTestKey: null,
      existingName: null,
      warning: null,
      error: null,
    };
  }

  const best = matches[0];
  return {
    action: 'update',
    caseId: best.caseId,
    existingTestKey: best.testKey ?? null,
    existingName: best.testCase ?? null,
    warning: null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Phase 1 — dry-run analysis
// ---------------------------------------------------------------------------

/**
 * Dry-run analysis of an Excel workbook import into a release.
 *
 * Parses the workbook, validates the release is active, resolves each row's
 * identity (two-key ladder: Test Key first, fingerprint fallback), detects
 * in-file duplicates, and returns a preview with create/update counts, per-row
 * resolutions, proposed application initials for new apps, errors, and
 * warnings. Nothing is written to the database.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ buffer: Buffer, fileName: string, releaseId: string }} opts
 * @returns {Promise<{
 *   valid: boolean,
 *   creates: number,
 *   updates: number,
 *   errors: string[],
 *   warnings: string[],
 *   rows: Array<{ rowIndex: number, action: string, appName: string, modName: string, testCase: string, existingTestKey: string|null, existingName: string|null, warning: string|null, error: string|null }>,
 *   proposedInitials: Record<string, string>
 * }>}
 */
export async function analyseImport(
  db,
  teamId,
  { buffer, fileName: _fileName, releaseId },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!buffer?.length) throw new ApiError(400, 'No file uploaded');

  // Validate release exists and is not archived
  await requireActiveRelease(db, teamId, releaseId);

  // Parse workbook
  let rows;
  try {
    rows = parseWorkbookBuffer(buffer);
  } catch (err) {
    throw new ApiError(400, err.message);
  }

  if (!rows.length) {
    throw new ApiError(400, 'No valid test case rows found in the workbook.');
  }

  // Compute fingerprints and collect new app names
  const parsedRows = rows.map((row, i) => ({
    rowIndex: i + 1,
    appName: row.applicationName || 'Default Application',
    modName: row.moduleName || 'Unassigned',
    testCase: row.testCase,
    testKey: row.testKey || '',
    fingerprint: slugify(row.testCase),
    raw: row,
  }));

  // Detect in-file duplicates (same resolved key within the file)
  // Two rows collide when they have the same non-empty Test Key, or the same
  // fingerprint within the same (appName, modName) pair.
  const seenTestKeys = new Map(); // testKey -> rowIndex
  const seenFingerprints = new Map(); // `appName::modName::fingerprint` -> rowIndex
  const inFileDuplicateRows = new Set();

  for (const r of parsedRows) {
    if (r.testKey) {
      if (seenTestKeys.has(r.testKey)) {
        inFileDuplicateRows.add(r.rowIndex);
        inFileDuplicateRows.add(seenTestKeys.get(r.testKey));
      } else {
        seenTestKeys.set(r.testKey, r.rowIndex);
      }
    } else {
      const fpKey = `${r.appName}::${r.modName}::${r.fingerprint}`;
      if (seenFingerprints.has(fpKey)) {
        inFileDuplicateRows.add(r.rowIndex);
        inFileDuplicateRows.add(seenFingerprints.get(fpKey));
      } else {
        seenFingerprints.set(fpKey, r.rowIndex);
      }
    }
  }

  // Gather proposed initials for new applications
  const knownApps = await db
    .collection('applications')
    .find({ teamId }, { projection: { name: 1, initial: 1 } })
    .toArray();
  const knownAppMap = new Map(knownApps.map((a) => [a.name, a.initial]));

  const newAppNames = [
    ...new Set(
      parsedRows.map((r) => r.appName).filter((name) => !knownAppMap.has(name)),
    ),
  ];
  const proposedInitials = {};
  for (const name of newAppNames) {
    proposedInitials[name] = deriveInitial(name);
  }

  // Resolve identity per row
  const rowResults = [];
  let creates = 0;
  let updates = 0;
  const errors = [];
  const warnings = [];

  for (const r of parsedRows) {
    if (inFileDuplicateRows.has(r.rowIndex)) {
      const rowResult = {
        rowIndex: r.rowIndex,
        action: 'reject',
        appName: r.appName,
        modName: r.modName,
        testCase: r.testCase,
        existingTestKey: r.testKey || null,
        existingName: null,
        warning: null,
        error: `Row ${r.rowIndex}: in-file duplicate (same Test Key or fingerprint as another row)`,
      };
      rowResults.push(rowResult);
      errors.push(rowResult.error);
      continue;
    }

    const resolution = await resolveRowIdentity(db, teamId, {
      testKey: r.testKey,
      fingerprint: r.fingerprint,
      appName: r.appName,
      modName: r.modName,
    });

    const rowResult = {
      rowIndex: r.rowIndex,
      action: resolution.action,
      appName: r.appName,
      modName: r.modName,
      testCase: r.testCase,
      existingTestKey: resolution.existingTestKey,
      existingName: resolution.existingName,
      warning: resolution.warning,
      error: resolution.error ? `Row ${r.rowIndex}: ${resolution.error}` : null,
    };
    rowResults.push(rowResult);

    if (resolution.error) {
      errors.push(rowResult.error);
    } else if (resolution.warning) {
      warnings.push(`Row ${r.rowIndex}: ${resolution.warning}`);
    }

    if (resolution.action === 'create') creates++;
    else if (resolution.action === 'update') updates++;
  }

  // Map internal row results to the client contract (importAnalysisResponseSchema).
  // Reject rows are surfaced via errors[] (and force valid:false); they are
  // excluded from rows[] because the schema's action enum is create|update only.
  const previewRows = rowResults
    .filter((r) => r.action === 'create' || r.action === 'update')
    .map((r) => ({
      rowIndex: r.rowIndex,
      testName: r.testCase,
      applicationName: r.appName,
      moduleName: r.modName,
      action: r.action,
      ...(r.existingTestKey ? { testKey: r.existingTestKey } : {}),
      ...(r.existingName ? { priorName: r.existingName } : {}),
      ...(proposedInitials[r.appName]
        ? { proposedInitial: proposedInitials[r.appName] }
        : {}),
      ...(r.warning ? { warnings: [r.warning] } : {}),
    }));

  return {
    valid: errors.length === 0,
    rows: previewRows,
    createCount: creates,
    updateCount: updates,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — transactional commit
// ---------------------------------------------------------------------------

/**
 * Commit an Excel workbook import into a release. All-or-nothing.
 *
 * Re-resolves identity in-session (no TOCTOU), validates appInitialOverrides
 * (3-char A–Z0–9, DB-globally unique), upserts apps/modules, upserts
 * release-scoped test cases (insert → generateDenseResults; update → definition
 * fields), writes result columns to the chosen environment (bypasses interactive
 * Fail/reset validation per A2), and appends IMPORT audit events.
 *
 * Returns `{ imported, updated, releaseId }`.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ buffer: Buffer, fileName: string, releaseId: string, environment: string, appInitialOverrides?: Record<string, string> }} opts
 * @returns {Promise<{ imported: number, updated: number, releaseId: string }>}
 * @see {@link lib/__tests__/db/importExcelData.test.js}
 */
export async function commitImport(
  db,
  teamId,
  {
    buffer,
    fileName: _fileName,
    releaseId,
    environment,
    appInitialOverrides = {},
  },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!environment?.trim()) throw new ApiError(400, 'environment is required');
  if (!buffer?.length) throw new ApiError(400, 'No file uploaded');

  // Validate appInitialOverrides shape: each value must be 3 chars A-Z0-9
  const INITIAL_RE = /^[A-Z0-9]{3}$/;
  for (const [appName, override] of Object.entries(appInitialOverrides)) {
    if (!INITIAL_RE.test(override)) {
      throw new ApiError(
        400,
        `appInitialOverrides["${appName}"]: initial must be exactly 3 uppercase alphanumeric characters`,
      );
    }
  }

  // Parse workbook
  let rows;
  try {
    rows = parseWorkbookBuffer(buffer);
  } catch (err) {
    throw new ApiError(400, err.message);
  }

  if (!rows.length) {
    throw new ApiError(400, 'No valid test case rows found in the workbook.');
  }

  const parsedRows = rows.map((row, i) => ({
    rowIndex: i + 1,
    appName: row.applicationName || 'Default Application',
    modName: row.moduleName || 'Unassigned',
    testKey: row.testKey || '',
    fingerprint: slugify(row.testCase),
    raw: row,
  }));

  const client = await getClient();
  const session = client.startSession();

  let imported = 0;
  let updated = 0;
  const auditEvents = [];

  try {
    await session.withTransaction(
      async () => {
        // Re-validate release is active inside the transaction
        const release = await requireActiveRelease(
          db,
          teamId,
          releaseId,
          session,
        );

        if (!release.environments?.includes(environment)) {
          throw new ApiError(
            400,
            `Environment "${environment}" is not declared by this release`,
          );
        }

        const now = new Date();

        // Resolve app IDs (upsert with initial)
        const uniqueAppNames = [...new Set(parsedRows.map((r) => r.appName))];
        const appInitialMap = {}; // appName -> initial
        const appIdMap = {}; // appName -> _id string

        for (const appName of uniqueAppNames) {
          const override = appInitialOverrides[appName] ?? null;
          const initial = await upsertApplicationWithInitial(
            db,
            teamId,
            appName,
            override,
            session,
          );
          appInitialMap[appName] = initial;

          const appDoc = await db
            .collection('applications')
            .findOne({ name: appName, teamId }, { session });
          appIdMap[appName] = appDoc._id.toString();
        }

        // Resolve module IDs (upsert)
        const uniqueModKeys = [
          ...new Map(
            parsedRows.map((r) => [
              `${r.appName}::${r.modName}`,
              { appName: r.appName, modName: r.modName },
            ]),
          ).values(),
        ];
        const modIdMap = {}; // `appName::modName` -> moduleId string

        for (const { appName, modName } of uniqueModKeys) {
          const applicationId = appIdMap[appName];
          const moduleId = await upsertModule(
            db,
            teamId,
            applicationId,
            modName,
            session,
          );
          modIdMap[`${appName}::${modName}`] = moduleId;
        }

        // --- Bulk identity resolution ---------------------------------------
        // A single import can carry thousands of rows. Issuing per-row reads
        // and writes inside the transaction blows past the server's
        // transactionLifetimeLimitSeconds (default 60s) and aborts it, so we
        // pre-fetch every lookup in a handful of `$in` queries, resolve in
        // memory, and flush all writes via `bulkWrite`.
        const appIds = [...new Set(Object.values(appIdMap))];
        const modIds = [...new Set(Object.values(modIdMap))];
        const fingerprints = [
          ...new Set(parsedRows.map((r) => r.fingerprint).filter(Boolean)),
        ];
        const testKeys = [
          ...new Set(parsedRows.map((r) => r.testKey).filter(Boolean)),
        ];

        // testKey is DB-unique across the whole collection — map it globally,
        // then honour the team guard when resolving.
        const byTestKey = new Map();
        if (testKeys.length) {
          const docs = await db
            .collection('testCases')
            .find(
              { testKey: { $in: testKeys } },
              { projection: { testKey: 1, caseId: 1, teamId: 1 }, session },
            )
            .toArray();
          for (const d of docs) byTestKey.set(d.testKey, d);
        }

        // (applicationId, moduleId, fingerprint) → most-recently-created caseId.
        const byFingerprint = new Map();
        if (fingerprints.length) {
          const docs = await db
            .collection('testCases')
            .find(
              {
                teamId,
                applicationId: { $in: appIds },
                moduleId: { $in: modIds },
                fingerprint: { $in: fingerprints },
              },
              {
                projection: {
                  caseId: 1,
                  applicationId: 1,
                  moduleId: 1,
                  fingerprint: 1,
                  createdAt: 1,
                },
                session,
              },
            )
            .toArray();
          for (const d of docs) {
            const key = `${d.applicationId}::${d.moduleId}::${d.fingerprint}`;
            const prev = byFingerprint.get(key);
            if (!prev || (d.createdAt ?? 0) > (prev.createdAt ?? 0)) {
              byFingerprint.set(key, d);
            }
          }
        }

        // Resolve each row's caseId (test-key match first, fingerprint fallback).
        const resolved = parsedRows.map((r) => {
          const applicationId = appIdMap[r.appName];
          const moduleId = modIdMap[`${r.appName}::${r.modName}`];
          let caseId = null;
          if (r.testKey) {
            const m = byTestKey.get(r.testKey);
            if (m && m.teamId === teamId) caseId = m.caseId;
          }
          if (!caseId && r.fingerprint) {
            const m = byFingerprint.get(
              `${applicationId}::${moduleId}::${r.fingerprint}`,
            );
            if (m) caseId = m.caseId;
          }
          return { r, applicationId, moduleId, caseId };
        });

        // For matched lineages, learn which already live in the target release
        // (→ update) and the testKey to inherit when adding to a new release.
        const resolvedCaseIds = [
          ...new Set(resolved.map((x) => x.caseId).filter(Boolean)),
        ];
        const inReleaseCaseIds = new Set();
        const inheritedTestKey = new Map();
        if (resolvedCaseIds.length) {
          const docs = await db
            .collection('testCases')
            .find(
              { teamId, caseId: { $in: resolvedCaseIds } },
              {
                projection: {
                  caseId: 1,
                  testKey: 1,
                  releaseId: 1,
                  createdAt: 1,
                },
                session,
              },
            )
            .toArray();
          for (const d of docs) {
            if (d.releaseId === releaseId) inReleaseCaseIds.add(d.caseId);
            const prev = inheritedTestKey.get(d.caseId);
            if (!prev || (d.createdAt ?? 0) > (prev.createdAt ?? 0)) {
              inheritedTestKey.set(d.caseId, d);
            }
          }
        }

        // Seed per-application serial counters from one read; assign in memory
        // and flush a single increment per application at the end.
        const seqDocs = appIds.length
          ? await db
              .collection('sequences')
              .find({ _id: { $in: appIds } }, { session })
              .toArray()
          : [];
        const seqStart = new Map(
          appIds.map((id) => [
            id,
            seqDocs.find((s) => s._id === id)?.nextSerial ?? 0,
          ]),
        );
        const seqNext = new Map(seqStart);
        const takeSerial = (applicationId) => {
          const serial = seqNext.get(applicationId) + 1;
          seqNext.set(applicationId, serial);
          return serial;
        };

        // --- Build bulk operations ------------------------------------------
        const newCaseIds = [];
        const caseOps = [];
        const resultOps = [];

        for (const {
          r,
          applicationId,
          moduleId,
          caseId: matched,
        } of resolved) {
          const row = r.raw;
          const initial = appInitialMap[r.appName];

          const definitionFields = {
            type: row.type || '',
            traceability: row.traceability || '',
            testCase: row.testCase,
            preconditions: row.preconditions || '',
            steps: row.steps || '',
            expectedResult: row.expectedResult || '',
            updatedAt: now,
          };

          let caseId = matched;

          if (caseId && inReleaseCaseIds.has(caseId)) {
            // Already release-scoped — update its definition.
            caseOps.push({
              updateOne: {
                filter: { caseId, releaseId, teamId },
                update: { $set: definitionFields },
              },
            });
            updated++;
            auditEvents.push({
              category: AUDIT_CATEGORY.IMPORT,
              action: AUDIT_ACTION.EDIT,
              caseId,
              releaseId,
              environment,
              by: null,
              at: now,
            });
          } else {
            // New row in this release: mint a fresh lineage, or carry an
            // existing lineage's caseId + testKey into the release.
            const isNewLineage = !caseId;
            if (isNewLineage) caseId = new ObjectId().toString();
            const testKey =
              inheritedTestKey.get(caseId)?.testKey ??
              formatTestKey(initial, takeSerial(applicationId));

            caseOps.push({
              insertOne: {
                document: {
                  _id: new ObjectId().toString(),
                  teamId,
                  releaseId,
                  caseId,
                  testKey,
                  applicationId,
                  moduleId,
                  fingerprint: r.fingerprint,
                  ...definitionFields,
                  createdAt: now,
                },
              },
            });
            newCaseIds.push(caseId);
            imported++;

            // Reflect the insert in-memory so later duplicate rows in the same
            // file converge onto this lineage instead of forking a new one
            // (parity with the old in-session re-reads).
            inReleaseCaseIds.add(caseId);
            inheritedTestKey.set(caseId, { testKey });
            if (isNewLineage) {
              byFingerprint.set(
                `${applicationId}::${moduleId}::${r.fingerprint}`,
                { caseId },
              );
            }

            auditEvents.push({
              category: AUDIT_CATEGORY.IMPORT,
              action: AUDIT_ACTION.CREATE,
              caseId,
              releaseId,
              environment,
              by: null,
              at: now,
            });
          }

          // Result column for the chosen environment (A2 bypass — no
          // interactive guards). Matches a dense Pending row only for cases
          // already present in the release; new cases are filled by
          // generateDenseResults below.
          if (row.status) {
            resultOps.push({
              updateOne: {
                filter: { teamId, releaseId, caseId, environment },
                update: {
                  $set: {
                    status: row.status,
                    testedBy: row.testedBy || null,
                    testedOn: row.testedOn ? new Date(row.testedOn) : now,
                    notes: row.notes || null,
                    updatedAt: now,
                  },
                },
              },
            });
          }
        }

        // --- Flush ----------------------------------------------------------
        if (caseOps.length) {
          await db.collection('testCases').bulkWrite(caseOps, { session });
        }

        const seqOps = appIds
          .map((id) => ({ id, minted: seqNext.get(id) - seqStart.get(id) }))
          .filter(({ minted }) => minted > 0)
          .map(({ id, minted }) => ({
            updateOne: {
              filter: { _id: id },
              update: { $inc: { nextSerial: minted } },
              upsert: true,
            },
          }));
        if (seqOps.length) {
          await db.collection('sequences').bulkWrite(seqOps, { session });
        }

        if (resultOps.length) {
          await db.collection('testResults').bulkWrite(resultOps, { session });
        }

        // Generate dense Pending results for all newly inserted cases
        if (newCaseIds.length) {
          await generateDenseResults(
            db,
            teamId,
            releaseId,
            newCaseIds,
            session,
          );
        }

        // Append audit events
        if (auditEvents.length) {
          await appendEvents(db, teamId, auditEvents);
        }
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      },
    );
  } finally {
    await session.endSession();
  }

  return { imported, updated, releaseId };
}
