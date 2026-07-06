import { unstable_cache } from 'next/cache';
import {
  CACHE_TTL,
  DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD,
  DASHBOARD_TOP_FAILING_MODULES_LIMIT,
  PRIORITIES,
  STATUS,
} from '@/lib/constants';
import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { getDb } from '@/lib/mongodb';

// Group aggregation rows by display name. Distinct source ids can resolve to the
// same name (e.g. same-named modules in different apps) or to the `fallback`
// bucket (unresolved/absent ids); such rows are MERGED (counts summed) rather
// than overwritten, so no results are silently dropped. `rows` arrive sorted by
// total desc, so the first-seen (largest) contributor's id is kept.
const toGroups = (rows, nameOf, fallback) => {
  const groups = {};
  for (const {
    _id,
    total: t,
    passed: p,
    failed: f,
    knownIssue: k = 0,
  } of rows) {
    const key = nameOf(_id) ?? fallback;
    const existing = groups[key];
    if (existing) {
      existing.total += t;
      existing.passed += p;
      existing.failed += f;
      existing.knownIssue += k;
      existing.pending += t - p - f - k;
    } else {
      groups[key] = {
        id: _id?.toString?.() ?? String(_id),
        total: t,
        passed: p,
        failed: f,
        knownIssue: k,
        pending: t - p - f - k,
      };
    }
  }
  return groups;
};

/**
 * Aggregates dashboard metrics for a given (teamId, releaseId, environment)
 * tuple by reading execution state from `testResults` and joining back to
 * `testCases` for application/module grouping.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @param {string} environment
 * @returns {Promise<object>}
 * @see {@link lib/__tests__/db/dashboardData.test.js}
 */
export async function getDashboardData(
  db,
  teamId,
  releaseId,
  environment,
  {
    failureThreshold = DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD,
    topModulesLimit = DASHBOARD_TOP_FAILING_MODULES_LIMIT,
  } = {},
) {
  const passExpr = { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] };
  const failExpr = { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] };
  const knownIssueExpr = {
    $cond: [{ $eq: ['$status', STATUS.KNOWN_ISSUE] }, 1, 0],
  };

  const resultMatch = { teamId, releaseId, environment };

  const [[agg], { appMap, modMap, modules }] = await Promise.all([
    db
      .collection('testResults')
      .aggregate([
        { $match: resultMatch },
        {
          // Join to testCases for application/module grouping
          $lookup: {
            from: 'testCases',
            let: { tcId: '$tcId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$_id', { $toObjectId: '$$tcId' }],
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  moduleId: 1,
                  applicationId: 1,
                  priority: 1,
                  testCase: 1,
                  testKey: 1,
                },
              },
            ],
            as: '_tc',
          },
        },
        {
          $set: {
            moduleId: { $ifNull: [{ $first: '$_tc.moduleId' }, null] },
            applicationId: {
              $ifNull: [{ $first: '$_tc.applicationId' }, null],
            },
            testCaseName: {
              $ifNull: [{ $first: '$_tc.testCase' }, 'Untitled'],
            },
            testKey: { $ifNull: [{ $first: '$_tc.testKey' }, '—'] },
            priority: { $ifNull: [{ $first: '$_tc.priority' }, ''] },
          },
        },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  passed: { $sum: passExpr },
                  failed: { $sum: failExpr },
                  knownIssue: { $sum: knownIssueExpr },
                },
              },
            ],
            byModule: [
              {
                $group: {
                  _id: '$moduleId',
                  total: { $sum: 1 },
                  passed: { $sum: passExpr },
                  failed: { $sum: failExpr },
                  knownIssue: { $sum: knownIssueExpr },
                },
              },
              { $sort: { total: -1 } },
            ],
            byTester: [
              {
                $group: {
                  _id: { $ifNull: ['$assignedTo', ''] },
                  total: { $sum: 1 },
                  passed: { $sum: passExpr },
                  failed: { $sum: failExpr },
                  knownIssue: { $sum: knownIssueExpr },
                },
              },
              { $sort: { total: -1 } },
            ],
            highPrioritySummary: [
              { $match: { priority: PRIORITIES.HIGH } },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  passed: { $sum: passExpr },
                  failed: { $sum: failExpr },
                  knownIssue: { $sum: knownIssueExpr },
                },
              },
            ],
            byCriticalCase: [
              { $match: { priority: PRIORITIES.HIGH, status: STATUS.FAIL } },
              {
                $group: {
                  _id: '$testKey',
                  priority: { $first: '$priority' },
                  moduleId: { $first: '$moduleId' },
                  applicationId: { $first: '$applicationId' },
                  failed: { $sum: failExpr },
                },
              },
              { $sort: { failed: -1, _id: 1 } },
              { $limit: 4 },
            ],
          },
        },
      ])
      .toArray(),
    fetchAppModMaps(db, teamId),
  ]);

  const modInfoMap = Object.fromEntries(
    modules.map((m) => [
      m._id.toString(),
      { name: m.name, appId: m.applicationId?.toString() ?? null },
    ]),
  );

  const s = agg?.summary?.[0] ?? {
    total: 0,
    passed: 0,
    failed: 0,
    knownIssue: 0,
  };
  const highPriority = agg?.highPrioritySummary?.[0] ?? {
    total: 0,
    passed: 0,
    failed: 0,
    knownIssue: 0,
  };
  const { total, passed, failed, knownIssue = 0 } = s;
  const pending = total - passed - failed - knownIssue;

  const modulesByApp = {};
  for (const row of agg?.byModule ?? []) {
    if (!row._id) continue;
    const id = row._id.toString();
    const info = modInfoMap[id];
    if (!info) continue;
    const appName = appMap[info.appId] ?? 'Unknown';
    const modName = info.name ?? 'Unknown';
    const t = row.total,
      p = row.passed,
      f = row.failed,
      k = row.knownIssue ?? 0,
      pend = t - p - f - k;
    if (!modulesByApp[appName]) {
      modulesByApp[appName] = {
        appId: info.appId,
        passed: 0,
        failed: 0,
        pending: 0,
        knownIssue: 0,
        total: 0,
        modules: {},
      };
    }
    modulesByApp[appName].passed += p;
    modulesByApp[appName].failed += f;
    modulesByApp[appName].pending += pend;
    modulesByApp[appName].knownIssue += k;
    modulesByApp[appName].total += t;
    modulesByApp[appName].modules[modName] = {
      passed: p,
      failed: f,
      pending: pend,
      knownIssue: k,
      total: t,
    };
  }

  const topFailingModules = (agg?.byModule ?? [])
    .filter((row) => row._id && row.failed >= failureThreshold)
    .map((row) => ({
      id: row._id.toString(),
      name:
        modMap[row._id] ?? modInfoMap[row._id?.toString?.()]?.name ?? 'Unknown',
      failed: row.failed,
      total: row.total,
    }))
    .sort(
      (a, b) =>
        b.failed - a.failed ||
        b.total - a.total ||
        a.name.localeCompare(b.name),
    )
    .slice(0, topModulesLimit);

  const criticalFailures = (agg?.byCriticalCase ?? []).map((row) => ({
    testKey: row._id ?? '—',
    priority: row.priority || PRIORITIES.HIGH,
    failed: row.failed,
    moduleName:
      modMap[row.moduleId] ??
      modInfoMap[row.moduleId?.toString?.()]?.name ??
      'Unknown',
    applicationName: appMap[row.applicationId] ?? 'Unknown',
  }));

  // Per-module failure counts, keyed by module id so distinct modules that share
  // a display name stay separate (the app name disambiguates them). Includes the
  // application name for context and always reconciles to `summary.failed`.
  const failByModule = (agg?.byModule ?? [])
    .filter((row) => row.failed > 0)
    .map((row) => {
      const id = row._id != null ? String(row._id) : null;
      const info = id ? modInfoMap[id] : null;
      return {
        moduleId: id,
        moduleName: info?.name ?? 'Unknown',
        appName: info?.appId ? (appMap[info.appId] ?? null) : null,
        failed: row.failed,
      };
    });

  return {
    summary: {
      total,
      passed,
      failed,
      pending,
      knownIssue,
      passPercent: total ? parseFloat(((passed / total) * 100).toFixed(1)) : 0,
      failPercent: total ? parseFloat(((failed / total) * 100).toFixed(1)) : 0,
    },
    criticalSummary: {
      total: highPriority.total,
      passed: highPriority.passed,
      failed: highPriority.failed,
      knownIssue: highPriority.knownIssue ?? 0,
      pending:
        highPriority.total -
        highPriority.passed -
        highPriority.failed -
        (highPriority.knownIssue ?? 0),
    },
    topFailingModules,
    criticalFailures,
    failByModule,
    moduleGroups: toGroups(agg?.byModule ?? [], (id) => modMap[id], 'Unknown'),
    testerGroups: toGroups(agg?.byTester ?? [], (id) => id, 'Unassigned'),
    modulesByApp,
  };
}

// Stable module-level reference — all args are appended to the cache key
// automatically by Next.js so each unique combination gets its own entry.
const _getCachedDashboardDataFn = unstable_cache(
  async (teamId, releaseId, environment, failureThreshold, topModulesLimit) => {
    const db = await getDb();
    return getDashboardData(db, teamId, releaseId, environment, {
      failureThreshold,
      topModulesLimit,
    });
  },
  // Bump the version suffix whenever the returned shape changes so stale cache
  // entries from a prior deploy (missing new fields) are never served.
  ['dashboard-data-v3'],
  { revalidate: CACHE_TTL.SHORT },
);

export const getCachedDashboardData = (
  teamId,
  releaseId,
  environment,
  {
    failureThreshold = DASHBOARD_TOP_FAILING_MODULES_FAILURE_THRESHOLD,
    topModulesLimit = DASHBOARD_TOP_FAILING_MODULES_LIMIT,
  } = {},
) =>
  _getCachedDashboardDataFn(
    teamId,
    releaseId,
    environment,
    failureThreshold,
    topModulesLimit,
  );
