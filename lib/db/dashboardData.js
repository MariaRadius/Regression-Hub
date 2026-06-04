import { unstable_cache } from 'next/cache';
import { CACHE_TTL, PRIORITIES, STATUS } from '@/lib/constants';
import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { getDb } from '@/lib/mongodb';

const toGroups = (rows, nameOf, fallback) =>
  Object.fromEntries(
    rows.map(({ _id, total: t, passed: p, failed: f }) => [
      nameOf(_id) ?? fallback,
      {
        id: _id?.toString?.() ?? String(_id),
        total: t,
        passed: p,
        failed: f,
        pending: t - p - f,
      },
    ]),
  );

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
export async function getDashboardData(db, teamId, releaseId, environment) {
  const passExpr = { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] };
  const failExpr = { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] };

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

  const s = agg?.summary?.[0] ?? { total: 0, passed: 0, failed: 0 };
  const highPriority = agg?.highPrioritySummary?.[0] ?? {
    total: 0,
    passed: 0,
    failed: 0,
  };
  const { total, passed, failed } = s;
  const pending = total - passed - failed;

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
      pend = t - p - f;
    if (!modulesByApp[appName]) {
      modulesByApp[appName] = {
        appId: info.appId,
        passed: 0,
        failed: 0,
        pending: 0,
        total: 0,
        modules: {},
      };
    }
    modulesByApp[appName].passed += p;
    modulesByApp[appName].failed += f;
    modulesByApp[appName].pending += pend;
    modulesByApp[appName].total += t;
    modulesByApp[appName].modules[modName] = {
      passed: p,
      failed: f,
      pending: pend,
      total: t,
    };
  }

  const topFailingModules = (agg?.byModule ?? [])
    .filter((row) => row._id && row.failed > 0)
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
    .slice(0, 4);

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

  return {
    summary: {
      total,
      passed,
      failed,
      pending,
      passPercent: total ? parseFloat(((passed / total) * 100).toFixed(1)) : 0,
      failPercent: total ? parseFloat(((failed / total) * 100).toFixed(1)) : 0,
    },
    criticalSummary: {
      total: highPriority.total,
      passed: highPriority.passed,
      failed: highPriority.failed,
      pending: highPriority.total - highPriority.passed - highPriority.failed,
    },
    topFailingModules,
    criticalFailures,
    moduleGroups: toGroups(agg?.byModule ?? [], (id) => modMap[id], 'Unknown'),
    testerGroups: toGroups(agg?.byTester ?? [], (id) => id, 'Unassigned'),
    modulesByApp,
  };
}

// Stable module-level reference — (teamId, releaseId, environment) are appended
// to the cache key automatically by Next.js so each combination gets its own entry.
const _getCachedDashboardDataFn = unstable_cache(
  async (teamId, releaseId, environment) => {
    const db = await getDb();
    return getDashboardData(db, teamId, releaseId, environment);
  },
  ['dashboard-data'],
  { revalidate: CACHE_TTL.SHORT },
);

export const getCachedDashboardData = (teamId, releaseId, environment) =>
  _getCachedDashboardDataFn(teamId, releaseId, environment);
