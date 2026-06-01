import { COMPLETED_STATUSES } from '@/lib/constants';
import { deriveInitial } from '@/utils/appInitial';
import { slugify } from '@/utils/slugify';

/**
 * Stage A — pre-parse fail-fast validation.
 *
 * Checks in order:
 *  1. File guard: MIME/extension + byte-size cap.
 *  2. teamId / releaseId / environment present.
 *  3. Release not archived and environment declared in environments list.
 *  4. Override values match ^[A-Z0-9]{3}$ with no duplicate values.
 *
 * Returns the first failure immediately; does not accumulate errors.
 *
 * @param {{ file: File|{ type: string, name: string, size: number }, teamId: string, releaseId: string, environment: string, isArchived: boolean, environments: string[], overrides: Record<string,string> }} params
 * @returns {{ ok: boolean, error: string|null }}
 *
 * @see utils/__tests__/importValidation.test.js
 */
export function validatePreParse({
  file,
  teamId,
  releaseId,
  environment,
  isArchived,
  environments,
  overrides,
}) {
  // 1. File guard
  if (!file) {
    return { ok: false, error: 'No file selected' };
  }

  const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
  const mime = file.type ?? '';
  const name = (file.name ?? '').toLowerCase();
  // Browsers may report .xlsx files as any of these MIME types, or as an empty
  // string (file picker on some OS/browsers) or application/octet-stream
  // (generic binary stream, e.g. Windows file system or programmatic upload).
  const XLSX_MIMES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ]);
  const mimeOk =
    XLSX_MIMES.has(mime) || mime === '' || mime === 'application/octet-stream';
  const extOk = name.endsWith('.xlsx');
  if (!mimeOk || !extOk) {
    return {
      ok: false,
      error: 'Invalid file type. Upload a .xlsx Excel workbook.',
    };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'File exceeds the 50 MB size limit' };
  }

  // 2. Required context fields
  if (!teamId) return { ok: false, error: 'Team is required' };
  if (!releaseId) return { ok: false, error: 'Release is required' };
  if (!environment) return { ok: false, error: 'Environment is required' };

  // 3. Release not archived; environment must be declared
  if (isArchived) {
    return { ok: false, error: 'Cannot import into an archived release' };
  }
  if (!Array.isArray(environments) || !environments.includes(environment)) {
    return {
      ok: false,
      error: `Environment "${environment}" is not declared on this release`,
    };
  }

  // 4. Override values must be ^[A-Z0-9]{3}$ with no duplicate values
  if (overrides && typeof overrides === 'object') {
    const overrideValues = Object.values(overrides);
    const INITIAL_RE = /^[A-Z0-9]{3}$/;
    for (const val of overrideValues) {
      if (!INITIAL_RE.test(val)) {
        return {
          ok: false,
          error: `Override initial "${val}" must be exactly 3 uppercase alphanumeric characters`,
        };
      }
    }
    const seen = new Set();
    for (const val of overrideValues) {
      if (seen.has(val)) {
        return {
          ok: false,
          error: `Override initial "${val}" is used more than once`,
        };
      }
      seen.add(val);
    }
  }

  return { ok: true, error: null };
}

/**
 * Stage B — post-parse aggregating validation.
 *
 * Structural guard (required-columns presence, row-count cap, field-length cap)
 * runs first and fails fast. Then a single O(N) walk over every row accumulates
 * ALL errors before returning once.
 *
 * @param {{
 *   rows: Array<{
 *     applicationName: string, moduleName: string, type: string,
 *     traceability: string, testKey: string, testCase: string,
 *     preconditions: string, steps: string, expectedResult: string,
 *     notes: string, status: string, testedBy: string, testedOn: string,
 *     fingerprint: string
 *   }>,
 *   roster: Array<{ name: string, username: string, [key: string]: unknown }>,
 *   knownApps: Array<{ name: string, initial: string }>,
 *   overrides: Record<string,string>,
 *   caps?: { maxRows?: number, maxFieldChars?: number, maxNameChars?: number }
 * }} params
 * @returns {{
 *   valid: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   apps: Array<{ name: string, isNew: boolean, proposedInitial: string }>
 * }}
 *
 * @see utils/__tests__/importValidation.test.js
 */
export function validateParsedRows({
  rows,
  roster,
  knownApps,
  overrides,
  caps,
}) {
  const maxRows = caps?.maxRows ?? 10000;
  const maxFieldChars = caps?.maxFieldChars ?? 20000;
  const maxNameChars = caps?.maxNameChars ?? 100;

  // --- Structural guard (fail-fast) ---

  if (!Array.isArray(rows)) {
    return {
      valid: false,
      errors: ['Rows must be an array'],
      warnings: [],
      apps: [],
    };
  }

  // Required columns: validate that every row object has the expected keys by
  // checking the first row (post-parse the client already checked headers; this
  // guard catches structurally malformed payloads).
  if (rows.length > 0) {
    const REQUIRED_KEYS = ['testCase', 'expectedResult', 'moduleName'];
    const firstRow = rows[0];
    const missingKeys = REQUIRED_KEYS.filter((k) => !(k in firstRow));
    if (missingKeys.length > 0) {
      return {
        valid: false,
        errors: [`Required columns missing: ${missingKeys.join(', ')}`],
        warnings: [],
        apps: [],
      };
    }
  }

  if (rows.length > maxRows) {
    return {
      valid: false,
      errors: [`Row count ${rows.length} exceeds the ${maxRows}-row limit`],
      warnings: [],
      apps: [],
    };
  }

  // Field-length cap check (structural guard — fails fast on first violation)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    for (const [key, val] of Object.entries(row)) {
      if (typeof val === 'string' && val.length > maxFieldChars) {
        return {
          valid: false,
          errors: [
            `Row ${rowNum}: field "${key}" exceeds the ${maxFieldChars}-character limit`,
          ],
          warnings: [],
          apps: [],
        };
      }
    }
  }

  // --- Single O(N) aggregating walk ---

  const errors = [];
  const warnings = [];

  // Build data structures needed for cross-row checks
  const knownAppMap = new Map(
    (knownApps ?? []).map((a) => [a.name, a.initial]),
  );

  // Roster lookup: set of names (any role, active or inactive)
  const rosterNames = new Set((roster ?? []).map((m) => m.name));

  // In-file duplicate tracking
  const seenTestKeys = new Map(); // testKey -> rowNum (1-based)
  const seenFingerprints = new Map(); // "appName::modName::fingerprint" -> rowNum
  const rejectedRows = new Set(); // row indices (0-based) that are duplicates

  // First pass: identify duplicates before error accumulation
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const testKey = (row.testKey ?? '').trim();
    if (testKey) {
      if (seenTestKeys.has(testKey)) {
        const priorRowNum = seenTestKeys.get(testKey);
        if (!rejectedRows.has(priorRowNum - 1)) {
          errors.push(
            `Row ${priorRowNum}: Test Key "${testKey}" is duplicated in this file`,
          );
          rejectedRows.add(priorRowNum - 1);
        }
        errors.push(
          `Row ${rowNum}: Test Key "${testKey}" is duplicated in this file`,
        );
        rejectedRows.add(i);
      } else {
        seenTestKeys.set(testKey, rowNum);
      }
    }

    const appName = (row.applicationName ?? '').trim();
    const modName = (row.moduleName ?? '').trim();
    const fp = row.fingerprint ?? slugify(row.testCase ?? '');
    const fpKey = `${appName}::${modName}::${fp}`;
    if (fp) {
      if (seenFingerprints.has(fpKey)) {
        const priorRowNum = seenFingerprints.get(fpKey);
        if (!rejectedRows.has(priorRowNum - 1)) {
          errors.push(
            `Row ${priorRowNum}: duplicate test case (same application, module, and test case) found in this file`,
          );
          rejectedRows.add(priorRowNum - 1);
        }
        errors.push(
          `Row ${rowNum}: duplicate test case (same application, module, and test case) found in this file`,
        );
        rejectedRows.add(i);
      } else {
        seenFingerprints.set(fpKey, rowNum);
      }
    }
  }

  // Collect all app names in rows, for override key validation
  const rowAppNames = new Set();

  // Per-app tracking to avoid repeated errors for the same app
  const appErrors = new Set();
  const newAppMap = new Map(); // appName -> proposedInitial (for new apps only)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    const appName = (row.applicationName ?? '').trim();
    const modName = (row.moduleName ?? '').trim();

    rowAppNames.add(appName);

    // (a) Application name must have ≥ 1 alphanumeric character
    if (appName && !/[a-zA-Z0-9]/.test(appName)) {
      const errKey = `app:alnum:${appName}`;
      if (!appErrors.has(errKey)) {
        appErrors.add(errKey);
        errors.push(`Application "${appName}" has no alphanumeric characters`);
      }
    }

    // Track new apps and proposed initials
    if (appName && !knownAppMap.has(appName) && !newAppMap.has(appName)) {
      let proposedInitial = '';
      try {
        proposedInitial = deriveInitial(appName);
      } catch {
        // Already caught by gate (a); proposedInitial stays ''
      }
      newAppMap.set(appName, proposedInitial);
    }

    // (e) Module name must have ≥ 1 alphanumeric character
    if (modName && !/[a-zA-Z0-9]/.test(modName)) {
      const errKey = `mod:alnum:${modName}`;
      if (!appErrors.has(errKey)) {
        appErrors.add(errKey);
        errors.push(`Module "${modName}" has no alphanumeric characters`);
      }
    }

    // (e) Module name length cap
    if (modName.length > maxNameChars) {
      const errKey = `mod:len:${modName}`;
      if (!appErrors.has(errKey)) {
        appErrors.add(errKey);
        errors.push(`Module name exceeds 100 characters`);
      }
    }

    // (d) testCase required
    if (!(row.testCase ?? '').trim()) {
      errors.push(`Row ${rowNum}: Test Case is required`);
    }

    // (d) expectedResult required
    if (!(row.expectedResult ?? '').trim()) {
      errors.push(`Row ${rowNum}: Expected Result is required`);
    }

    // (c) testedOn: must parse to a real date, not in the future
    const testedOn = (row.testedOn ?? '').trim();
    if (testedOn) {
      const parsed = new Date(testedOn);
      if (Number.isNaN(parsed.getTime())) {
        errors.push(
          `Row ${rowNum}: Tested On "${testedOn}" is not a valid date`,
        );
      } else {
        // Future check: compare date-only (local timezone per spec)
        const today = new Date();
        const todayDateOnly = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        const parsedDateOnly = new Date(
          parsed.getFullYear(),
          parsed.getMonth(),
          parsed.getDate(),
        );
        if (parsedDateOnly > todayDateOnly) {
          errors.push(`Row ${rowNum}: Tested On cannot be in the future`);
        }
      }
    }

    // (b) testedBy must be a team member (any role, active or inactive)
    const testedBy = (row.testedBy ?? '').trim();
    if (testedBy && !rosterNames.has(testedBy)) {
      errors.push(`Tested By "${testedBy}" is not a team member`);
    }

    // Status whitelist (hard reject)
    const status = (row.status ?? '').trim();
    if (status && !COMPLETED_STATUSES.includes(status)) {
      errors.push(`Row ${rowNum}: Status "${status}" is not a valid status`);
    }
  }

  // Override keys must reference apps present in rows
  if (overrides && typeof overrides === 'object') {
    for (const key of Object.keys(overrides)) {
      if (!rowAppNames.has(key)) {
        errors.push(
          `Override key "${key}" does not match any application in the file`,
        );
      }
    }
  }

  // Build apps preview
  const apps = [];
  for (const [name, initial] of knownAppMap) {
    if (rowAppNames.has(name)) {
      apps.push({ name, isNew: false, proposedInitial: initial });
    }
  }
  for (const [name, proposedInitial] of newAppMap) {
    apps.push({ name, isNew: true, proposedInitial });
  }
  // Sort for determinism
  apps.sort((a, b) => a.name.localeCompare(b.name));

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    apps,
  };
}
