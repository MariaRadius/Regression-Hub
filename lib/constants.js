export const STATUS = Object.freeze({
  PASS: 'Pass',
  FAIL: 'Fail',
  PENDING: 'Pending',
});

export const AUDIT_CATEGORY = Object.freeze({
  RESULT: 'result',
  TEST_CASE: 'test_case',
  ASSIGNMENT: 'assignment',
  IMPORT: 'import',
  RELEASE: 'release',
  AUTH: 'auth',
  USER: 'user',
  EXPORT: 'export',
  CONFIG: 'config',
});

export const AUDIT_ACTION = Object.freeze({
  // result
  PASS: 'pass',
  FAIL: 'fail',
  RESET: 'reset',
  // test_case / user (shared simple verbs)
  CREATE: 'create',
  EDIT: 'edit',
  UPDATE: 'update',
  DELETE: 'delete',
  // assignment
  ASSIGN: 'assign',
  // import
  IMPORT: 'import',
  // release
  ARCHIVE: 'archive',
  UNARCHIVE: 'unarchive',
  CLONE: 'clone',
  ADD_ENVIRONMENT: 'add-environment',
  REMOVE_ENVIRONMENT: 'remove-environment',
  // auth
  LOGIN: 'login',
  LOGOUT: 'logout',
  // user
  ROLE_CHANGE: 'role-change',
  PASSWORD_CHANGE: 'password-change',
  ACTIVATE: 'activate',
  DEACTIVATE: 'deactivate',
  // export
  EXPORT_EXCEL: 'excel',
  EXPORT_PDF: 'pdf',
  // config
  MODULE_CREATE: 'module-create',
  RESET_DATA: 'reset-data',
});

// Categories whose events carry a tcId and are surfaced in per-case History.
export const PER_CASE_CATEGORIES = Object.freeze([
  AUDIT_CATEGORY.RESULT,
  AUDIT_CATEGORY.TEST_CASE,
  AUDIT_CATEGORY.ASSIGNMENT,
  AUDIT_CATEGORY.IMPORT,
]);

// Categories surfaced in the admin Activity Logs panel.
// Excludes high-volume per-tester categories (RESULT, ASSIGNMENT).
export const ADMIN_SURFACE_CATEGORIES = Object.freeze([
  AUDIT_CATEGORY.USER,
  AUDIT_CATEGORY.RELEASE,
  AUDIT_CATEGORY.IMPORT,
  AUDIT_CATEGORY.CONFIG,
  AUDIT_CATEGORY.TEST_CASE,
]);

// Categories whose events die with their release (cascade on version delete).
// Excludes never-purge account/system categories (AUTH, USER, EXPORT, CONFIG).
export const CASCADE_CATEGORIES = Object.freeze([
  AUDIT_CATEGORY.RESULT,
  AUDIT_CATEGORY.TEST_CASE,
  AUDIT_CATEGORY.ASSIGNMENT,
  AUDIT_CATEGORY.IMPORT,
  AUDIT_CATEGORY.RELEASE,
]);

/**
 * Maps a STATUS value to the corresponding AUDIT_ACTION string.
 * STATUS.PASS -> 'pass', STATUS.FAIL -> 'fail', STATUS.PENDING -> 'reset'.
 *
 * @param {string} status - A STATUS constant value.
 * @returns {string} The matching AUDIT_ACTION value.
 * @see {@link lib/__tests__/constants.test.js}
 */
export function statusToAction(status) {
  if (status === STATUS.PASS) return AUDIT_ACTION.PASS;
  if (status === STATUS.FAIL) return AUDIT_ACTION.FAIL;
  return AUDIT_ACTION.RESET;
}

export const COMPLETED_STATUSES = Object.freeze([STATUS.PASS, STATUS.FAIL]);

export const ROLES = Object.freeze({
  ADMIN: 'admin',
  QA: 'qa',
});

export const ALL_ROLES = Object.freeze([ROLES.ADMIN, ROLES.QA]);

export const PRIORITIES = Object.freeze({
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
});

export const PRIORITY_DEFAULT = PRIORITIES.MEDIUM;

export const UNASSIGNED_SENTINEL = '__unassigned__';

/**
 * Environments pre-selected when creating a new release.
 * Users may add or remove environments after creation.
 */
export const DEFAULT_ENVIRONMENTS = Object.freeze([
  'QA',
  'Sandbox',
  'Production',
]);

export const CONFIRM_TOKENS = Object.freeze({
  DELETE: 'DELETE',
  RESET: 'RESET',
});

/**
 * Server-side cache TTLs in seconds, for use with Next.js `unstable_cache`
 * `{ revalidate }` option.
 *
 * SHORT — dynamic data (e.g. dashboard metrics): 1 minute
 * LONG  — reference data (e.g. applications, modules, settings): 5 minutes
 */
export const CACHE_TTL = Object.freeze({
  TINY: 5,
  SHORT: 60,
  LONG: 300,
});

/**
 * Pre-built Cache-Control header values for API route responses.
 * Each entry pairs `max-age` with a `stale-while-revalidate` window that keeps
 * responses fresh while the cache revalidates in the background.
 */
export const CACHE_CONTROL = Object.freeze({
  TINY: `private, max-age=${CACHE_TTL.TINY}, stale-while-revalidate=${CACHE_TTL.TINY * 5}`,
  SHORT: `private, max-age=${CACHE_TTL.SHORT}, stale-while-revalidate=${CACHE_TTL.SHORT * 5}`,
  LONG: `private, max-age=${CACHE_TTL.LONG}, stale-while-revalidate=${CACHE_TTL.LONG * 2}`,
  NONE: 'no-store',
});

export const DASHBOARD_TOP_FAILING_MODULES_LIMIT = 5;

export const DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD = 5;

export const TEAMS = Object.freeze({
  RADIUS: 'radius',
  CB: 'cb',
});

// Filter types for the Test Cases filter strip.
// `kind: 'select'` filters use enum options; `kind: 'text'` use free-text input.
// `optionsSource` indicates which runtime list to populate options from
// (resolved by FilterStrip — kept here so the schema lives in one place).
export const FILTER_TYPES = Object.freeze([
  {
    key: 'applicationId',
    label: 'Application',
    kind: 'select',
    optionsSource: 'applications',
  },
  {
    key: 'moduleId',
    label: 'Module',
    kind: 'select',
    optionsSource: 'modules',
  },
  {
    key: 'status',
    label: 'Status',
    kind: 'select',
    options: Object.values(STATUS),
  },
  {
    key: 'priority',
    label: 'Priority',
    kind: 'select',
    options: Object.values(PRIORITIES),
  },
  {
    key: 'testKey',
    label: 'Test Key',
    kind: 'text',
    placeholder: 'e.g. SAP-0454',
  },
  {
    key: 'testedBy',
    label: 'Tested By',
    kind: 'select',
    optionsSource: 'qaUsers',
  },
  {
    key: 'assignedTo',
    label: 'Assignee',
    kind: 'select',
    optionsSource: 'qaUsers',
  },
  {
    key: 'version',
    label: 'Version',
    kind: 'text',
    placeholder: 'e.g. v2.4.1',
  },
  {
    key: 'jiraStory',
    label: 'Jira Story',
    kind: 'text',
    placeholder: 'e.g. RXR-12345',
  },
]);

// Saved-view quick filters — each toggles one (key, value) pair in/out of the
// active filter map. View tab lights up whenever its value is present in
// active[key] (comma-OR aware). `value: '__currentUser__'` is resolved at
// render time by FilterStrip from the session user.
export const VIEW_PRESETS = Object.freeze([
  { id: 'mine', label: 'Mine', key: 'assignedTo', value: '__currentUser__' },
  { id: 'pending', label: 'Pending', key: 'status', value: STATUS.PENDING },
  { id: 'failed', label: 'Failed', key: 'status', value: STATUS.FAIL },
  {
    id: 'high',
    label: 'High priority',
    key: 'priority',
    value: PRIORITIES.HIGH,
  },
]);
