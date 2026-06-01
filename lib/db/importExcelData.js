import { ObjectId } from 'mongodb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { appendEvents } from '@/lib/db/eventsData';
import { generateDenseResults } from '@/lib/db/testResultsData';
import { ApiError } from '@/lib/errors';
import { getClient } from '@/lib/mongodb';
import { deriveInitial, nextInitialCandidate } from '@/utils/appInitial';

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

// ---------------------------------------------------------------------------
// Shared identity resolution
// ---------------------------------------------------------------------------

/**
 * Normalise a raw row into the internal shape used throughout resolution.
 * The client-derived fingerprint is trusted as-is (decision B — do NOT re-derive).
 *
 * @param {object} row - Wire-format row (13 fields + fingerprint).
 * @param {number} index - Zero-based position in the rows array.
 * @returns {{ rowIndex: number, appName: string, modName: string, testCase: string, testKey: string, fingerprint: string, raw: object }}
 */
function normaliseRow(row, index) {
  return {
    rowIndex: index + 1,
    appName: row.applicationName || 'Default Application',
    modName: row.moduleName || 'Unassigned',
    testCase: row.testCase,
    testKey: row.testKey || '',
    // Trust client-derived fingerprint (decision B); do NOT re-derive via slugify.
    fingerprint: row.fingerprint || '',
    raw: row,
  };
}

/**
 * Shared bulk identity-resolution function used by both analyseImport and
 * commitImport. Performs all DB reads in a bounded set of `$in` queries, then
 * resolves each row's identity in memory.
 *
 * Resolution ladder (per row):
 *  1. testKey found in DB, same team → app+module scope check:
 *     a. names match → update
 *     b. different team → reject ("belongs to a different team")
 *     c. names mismatch → reject ("belongs to a different application or module")
 *  2. testKey not in DB → fingerprint fallback + warning ("treated as new")
 *  3. No testKey → fingerprint fallback (app+module-scoped, newest-wins)
 *  4. No fingerprint match → create
 *
 * The Test-Key team/app/module scope reject (cases 2/3 / 13/14) lives here so
 * it is enforced in both analyse and commit (authoritative).
 *
 * Fingerprint resolution is app+module-scoped (authoritative — matches commit
 * semantics so preview agrees with commit).
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {Array<{ rowIndex: number, appName: string, modName: string, testCase: string, testKey: string, fingerprint: string, raw: object }>} parsedRows
 * @param {{ appIdMap?: Record<string,string>, modIdMap?: Record<string,string>, session?: import('mongodb').ClientSession }} [opts]
 * @returns {Promise<Array<{
 *   rowIndex: number,
 *   appName: string,
 *   modName: string,
 *   testCase: string,
 *   action: 'create'|'update'|'reject',
 *   existingTestKey: string|null,
 *   existingCaseId: string|null,
 *   existingName: string|null,
 *   warning: string|null,
 *   error: string|null,
 *   fingerprint: string,
 *   raw: object
 * }>>}
 * @see {@link lib/__tests__/db/importExcelData.test.js}
 * @see {@link lib/__tests__/db/analyseImport.test.js}
 */
async function resolveIdentities(db, teamId, parsedRows, opts = {}) {
  const { appIdMap = {}, modIdMap = {}, session } = opts;

  // --- In-file duplicate detection ----------------------------------------
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

  // --- Batch DB reads (bounded query count regardless of row count) --------

  // 1. Test-Key batch lookup — one query for all unique non-empty testKeys.
  //    testKey is DB-unique across the collection; fetch globally, enforce team
  //    guard in-memory.
  const uniqueTestKeys = [
    ...new Set(parsedRows.map((r) => r.testKey).filter(Boolean)),
  ];
  const byTestKey = new Map(); // testKey -> testCase doc
  if (uniqueTestKeys.length) {
    const docs = await db
      .collection('testCases')
      .find(
        { testKey: { $in: uniqueTestKeys } },
        {
          projection: {
            caseId: 1,
            testKey: 1,
            teamId: 1,
            applicationId: 1,
            moduleId: 1,
            testCase: 1,
          },
          session,
        },
      )
      .toArray();
    for (const d of docs) byTestKey.set(d.testKey, d);
  }

  // 2. For testKey matches, resolve application and module names in batch so we
  //    can check scope agreement without per-row round-trips.
  const matchedAppIds = [
    ...new Set(
      [...byTestKey.values()]
        .filter((d) => d.teamId === teamId)
        .map((d) => d.applicationId),
    ),
  ];
  const matchedModIds = [
    ...new Set(
      [...byTestKey.values()]
        .filter((d) => d.teamId === teamId)
        .map((d) => d.moduleId),
    ),
  ];

  const appNameById = new Map();
  if (matchedAppIds.length) {
    const appDocs = await db
      .collection('applications')
      .find(
        { _id: { $in: matchedAppIds }, teamId },
        { projection: { name: 1 }, session },
      )
      .toArray();
    for (const a of appDocs) appNameById.set(a._id.toString(), a.name);
  }

  const modNameById = new Map();
  if (matchedModIds.length) {
    const modDocs = await db
      .collection('modules')
      .find(
        { _id: { $in: matchedModIds }, teamId },
        { projection: { name: 1 }, session },
      )
      .toArray();
    for (const m of modDocs) modNameById.set(m._id.toString(), m.name);
  }

  // 3. Fingerprint batch lookup — app+module-scoped, newest-wins per unique
  //    (applicationId, moduleId, fingerprint) triple. This matches commit's
  //    authoritative resolution so preview agrees with commit.
  //    When appIdMap/modIdMap are provided (commit path), use IDs directly.
  //    When absent (analyse path), collect all team testCases with matching
  //    fingerprints and filter by name-derived scope using the above maps.
  const uniqueFingerprints = [
    ...new Set(parsedRows.map((r) => r.fingerprint).filter(Boolean)),
  ];
  // byFingerprint: `appName::modName::fingerprint` -> best testCase doc
  const byFingerprint = new Map();

  if (uniqueFingerprints.length) {
    const hasIdMaps = Object.keys(appIdMap).length > 0;

    if (hasIdMaps) {
      // Commit path: IDs known — scope query precisely.
      const appIds = [...new Set(Object.values(appIdMap))];
      const modIds = [...new Set(Object.values(modIdMap))];
      const docs = await db
        .collection('testCases')
        .find(
          {
            teamId,
            applicationId: { $in: appIds },
            moduleId: { $in: modIds },
            fingerprint: { $in: uniqueFingerprints },
          },
          {
            projection: {
              caseId: 1,
              testKey: 1,
              testCase: 1,
              fingerprint: 1,
              applicationId: 1,
              moduleId: 1,
              createdAt: 1,
            },
            session,
          },
        )
        .toArray();

      // Build reverse maps: id -> name (for key building)
      const idToApp = Object.fromEntries(
        Object.entries(appIdMap).map(([name, id]) => [id, name]),
      );
      const idToMod = new Map();
      for (const [key, id] of Object.entries(modIdMap)) {
        const modName = key.split('::')[1];
        idToMod.set(id, modName);
      }

      for (const d of docs) {
        const appName = idToApp[d.applicationId];
        const modName = idToMod.get(d.moduleId);
        if (!appName || !modName) continue;
        const key = `${appName}::${modName}::${d.fingerprint}`;
        const prev = byFingerprint.get(key);
        if (!prev || (d.createdAt ?? 0) > (prev.createdAt ?? 0)) {
          byFingerprint.set(key, d);
        }
      }
    } else {
      // Analyse path: no IDs yet — fetch all team docs with matching
      // fingerprints, then scope by (applicationId, moduleId) resolved from
      // name maps. Extend appNameById/modNameById with any IDs found in the
      // fingerprint docs that were not already covered by the testKey lookup.
      const docs = await db
        .collection('testCases')
        .find(
          { teamId, fingerprint: { $in: uniqueFingerprints } },
          {
            projection: {
              caseId: 1,
              testKey: 1,
              testCase: 1,
              fingerprint: 1,
              applicationId: 1,
              moduleId: 1,
              createdAt: 1,
            },
            session,
          },
        )
        .toArray();

      // Collect any applicationId/moduleId not yet in the name maps so we can
      // look them up in a single extra batch per collection (bounded: only the
      // distinct IDs appearing in the fingerprint result set).
      const extraAppIds = [
        ...new Set(
          docs
            .map((d) => d.applicationId?.toString())
            .filter((id) => id && !appNameById.has(id)),
        ),
      ];
      const extraModIds = [
        ...new Set(
          docs
            .map((d) => d.moduleId?.toString())
            .filter((id) => id && !modNameById.has(id)),
        ),
      ];

      if (extraAppIds.length) {
        const extraApps = await db
          .collection('applications')
          .find(
            { _id: { $in: extraAppIds }, teamId },
            { projection: { name: 1 }, session },
          )
          .toArray();
        for (const a of extraApps) appNameById.set(a._id.toString(), a.name);
      }

      if (extraModIds.length) {
        const extraMods = await db
          .collection('modules')
          .find(
            { _id: { $in: extraModIds }, teamId },
            { projection: { name: 1 }, session },
          )
          .toArray();
        for (const m of extraMods) modNameById.set(m._id.toString(), m.name);
      }

      for (const d of docs) {
        const appName = appNameById.get(d.applicationId?.toString());
        const modName = modNameById.get(d.moduleId?.toString());
        if (!appName || !modName) continue;
        const key = `${appName}::${modName}::${d.fingerprint}`;
        const prev = byFingerprint.get(key);
        if (!prev || (d.createdAt ?? 0) > (prev.createdAt ?? 0)) {
          byFingerprint.set(key, d);
        }
      }
    }
  }

  // --- In-memory identity resolution per row --------------------------------
  const results = [];

  for (const r of parsedRows) {
    if (inFileDuplicateRows.has(r.rowIndex)) {
      results.push({
        rowIndex: r.rowIndex,
        appName: r.appName,
        modName: r.modName,
        testCase: r.testCase,
        action: 'reject',
        existingTestKey: r.testKey || null,
        existingCaseId: null,
        existingName: null,
        warning: null,
        error: `Row ${r.rowIndex}: in-file duplicate (same Test Key or fingerprint as another row)`,
        fingerprint: r.fingerprint,
        raw: r.raw,
      });
      continue;
    }

    let action = 'create';
    let existingTestKey = null;
    let existingCaseId = null;
    let existingName = null;
    let warning = null;
    let error = null;

    if (r.testKey) {
      const matched = byTestKey.get(r.testKey);
      if (matched) {
        // Team guard (cases 13/14 — enforced here in the shared resolver)
        if (matched.teamId !== teamId) {
          error = `Test Key ${r.testKey} belongs to a different team`;
          action = 'reject';
        } else {
          // App/module scope check (in-memory, names resolved from batch reads)
          const resolvedAppName = appNameById.get(
            matched.applicationId?.toString(),
          );
          const resolvedModName = modNameById.get(matched.moduleId?.toString());
          if (resolvedAppName !== r.appName || resolvedModName !== r.modName) {
            error = `Test Key ${r.testKey} belongs to a different application or module`;
            existingName = matched.testCase ?? null;
            action = 'reject';
          } else {
            action = 'update';
            existingTestKey = r.testKey;
            existingCaseId = matched.caseId ?? null;
            existingName = matched.testCase ?? null;
          }
        }
      } else {
        // testKey not in DB — fingerprint fallback with warning
        warning = `Test Key ${r.testKey} was not found — treated as new (fingerprint fallback)`;
        const fpKey = `${r.appName}::${r.modName}::${r.fingerprint}`;
        const fp = byFingerprint.get(fpKey);
        if (fp) {
          action = 'update';
          existingTestKey = fp.testKey ?? null;
          existingCaseId = fp.caseId ?? null;
          existingName = fp.testCase ?? null;
        } else {
          action = 'create';
        }
      }
    } else {
      // No testKey — app+module-scoped fingerprint fallback
      const fpKey = `${r.appName}::${r.modName}::${r.fingerprint}`;
      const fp = byFingerprint.get(fpKey);
      if (fp) {
        action = 'update';
        existingTestKey = fp.testKey ?? null;
        existingCaseId = fp.caseId ?? null;
        existingName = fp.testCase ?? null;
      } else {
        action = 'create';
      }
    }

    results.push({
      rowIndex: r.rowIndex,
      appName: r.appName,
      modName: r.modName,
      testCase: r.testCase,
      action,
      existingTestKey,
      existingCaseId,
      existingName,
      warning,
      error: error ? `Row ${r.rowIndex}: ${error}` : null,
      fingerprint: r.fingerprint,
      raw: r.raw,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Phase 1 — dry-run analysis
// ---------------------------------------------------------------------------

/**
 * Dry-run analysis of an import rows payload into a release.
 *
 * Validates the release is active, resolves each row's identity (two-key
 * ladder: Test Key first, fingerprint fallback), detects in-file duplicates,
 * and returns a preview with create/update counts, per-row resolutions,
 * proposed application initials for new apps, errors, and warnings.
 * Nothing is written to the database.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ rows: object[], releaseId: string }} opts
 * @returns {Promise<{
 *   valid: boolean,
 *   rows: Array<{ rowIndex: number, testName: string, applicationName: string, moduleName: string, action: 'create'|'update', testKey?: string, priorName?: string, proposedInitial?: string, warnings?: string[] }>,
 *   createCount: number,
 *   updateCount: number,
 *   errors: string[],
 *   warnings: string[]
 * }>}
 * @see {@link lib/__tests__/db/analyseImport.test.js}
 */
export async function analyseImport(db, teamId, { rows, releaseId }) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!Array.isArray(rows) || !rows.length) {
    throw new ApiError(400, 'No valid test case rows found.');
  }

  // Validate release exists and is not archived
  await requireActiveRelease(db, teamId, releaseId);

  const parsedRows = rows.map(normaliseRow);

  // --- Known applications — drives proposedInitials ---
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
    try {
      proposedInitials[name] = deriveInitial(name);
    } catch {
      // App name with no alphanumerics — floor guard in route.js handles 400;
      // here we just skip the proposedInitial rather than throwing.
    }
  }

  // --- Shared identity resolution ---
  const rowResults = await resolveIdentities(db, teamId, parsedRows);

  // --- Aggregate counts, errors, warnings ---
  let creates = 0;
  let updates = 0;
  const errors = [];
  const warnings = [];

  for (const r of rowResults) {
    if (r.error) {
      errors.push(r.error);
    } else if (r.warning) {
      warnings.push(`Row ${r.rowIndex}: ${r.warning}`);
    }
    if (r.action === 'create') creates++;
    else if (r.action === 'update') updates++;
  }

  // --- Preview mapping -------------------------------------------------------
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
 * Commit an import rows payload into a release. All-or-nothing.
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
 * @param {{ rows: object[], releaseId: string, environment: string, appInitialOverrides?: Record<string, string> }} opts
 * @returns {Promise<{ imported: number, updated: number, releaseId: string }>}
 * @see {@link lib/__tests__/db/importExcelData.test.js}
 */
export async function commitImport(
  db,
  teamId,
  { rows, releaseId, environment, appInitialOverrides = {} },
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!releaseId) throw new ApiError(400, 'releaseId required');
  if (!environment?.trim()) throw new ApiError(400, 'environment is required');
  if (!Array.isArray(rows) || !rows.length) {
    throw new ApiError(400, 'No valid test case rows found.');
  }

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

  const parsedRows = rows.map(normaliseRow);

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

        // --- Bulk identity resolution via shared resolver -------------------
        const resolvedRows = await resolveIdentities(db, teamId, parsedRows, {
          appIdMap,
          modIdMap,
          session,
        });

        // Seed per-application serial counters from one read; assign in memory
        // and flush a single increment per application at the end.
        const appIds = [...new Set(Object.values(appIdMap))];
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

        // For matched lineages, learn which already live in the target release
        // (→ update) and the testKey to inherit when adding to a new release.
        // resolveIdentities now returns existingCaseId for all matched rows
        // (both testKey and fingerprint matches), so a single $in query covers
        // all cases — no separate fp-only re-query needed.
        const existingCaseIds = [
          ...new Set(
            resolvedRows
              .filter((x) => x.action !== 'reject' && x.existingCaseId)
              .map((x) => x.existingCaseId),
          ),
        ];

        const inReleaseCaseIds = new Set();
        const inheritedTestKey = new Map(); // caseId -> { testKey, createdAt? }

        if (existingCaseIds.length) {
          const matchDocs = await db
            .collection('testCases')
            .find(
              { teamId, caseId: { $in: existingCaseIds } },
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
          for (const d of matchDocs) {
            if (d.releaseId === releaseId) inReleaseCaseIds.add(d.caseId);
            const prev = inheritedTestKey.get(d.caseId);
            if (!prev || (d.createdAt ?? 0) > (prev.createdAt ?? 0)) {
              inheritedTestKey.set(d.caseId, {
                testKey: d.testKey,
                createdAt: d.createdAt,
              });
            }
          }
        }

        // In-memory map for new-lineage fp tracking (no DB hit needed).
        const fpToCaseId = new Map(); // `appName::modName::fp` -> caseId (in-memory only)

        // --- Build bulk operations ------------------------------------------
        const newCaseIds = [];
        const caseOps = [];
        const resultOps = [];

        for (const resolved of resolvedRows) {
          if (resolved.action === 'reject') continue;

          const r = resolved;
          const row = r.raw;
          const applicationId = appIdMap[r.appName];
          const moduleId = modIdMap[`${r.appName}::${r.modName}`];
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

          // Resolve caseId from the resolver (covers both testKey and fp matches)
          // or fall back to the in-memory fpToCaseId map for rows whose lineage
          // was created earlier in this same batch.
          let caseId = r.existingCaseId ?? null;
          if (!caseId && r.action === 'update') {
            const fpKey = `${r.appName}::${r.modName}::${r.fingerprint}`;
            caseId = fpToCaseId.get(fpKey) ?? null;
          }

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
              const fpKey = `${r.appName}::${r.modName}::${r.fingerprint}`;
              fpToCaseId.set(fpKey, caseId);
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
