import { unstable_cache } from 'next/cache';
import { CACHE_TTL, STATUS } from '@/lib/constants';
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

export async function getDashboardData(db, teamId, applicationId = '') {
  const match = applicationId ? { teamId, applicationId } : { teamId };

  const passExpr = { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] };
  const failExpr = { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] };

  const [[agg], { appMap, modMap, modules }] = await Promise.all([
    db
      .collection('testCases')
      .aggregate([
        { $match: match },
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
                  _id: { $ifNull: ['$testedBy', ''] },
                  total: { $sum: 1 },
                  passed: { $sum: passExpr },
                  failed: { $sum: failExpr },
                },
              },
              { $sort: { total: -1 } },
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

  const s = agg.summary[0] ?? { total: 0, passed: 0, failed: 0 };
  const { total, passed, failed } = s;
  const pending = total - passed - failed;

  const modulesByApp = {};
  for (const row of agg.byModule) {
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

  return {
    summary: {
      total,
      passed,
      failed,
      pending,
      passPercent: total ? parseFloat(((passed / total) * 100).toFixed(1)) : 0,
      failPercent: total ? parseFloat(((failed / total) * 100).toFixed(1)) : 0,
    },
    moduleGroups: toGroups(agg.byModule, (id) => modMap[id], 'Unknown'),
    testerGroups: toGroups(agg.byTester, (id) => id, 'Unassigned'),
    modulesByApp,
  };
}

// Stable module-level reference — arguments (teamId, applicationId) are automatically
// appended to the cache key by Next.js, so each (teamId, applicationId) combination
// gets its own cache entry.
const _getCachedDashboardDataFn = unstable_cache(
  async (teamId, applicationId) => {
    const db = await getDb();
    return getDashboardData(db, teamId, applicationId);
  },
  ['dashboard-data'],
  { revalidate: CACHE_TTL.SHORT },
);

export const getCachedDashboardData = (teamId, applicationId = '') =>
  _getCachedDashboardDataFn(teamId, applicationId);
