import { getDb } from '@/lib/mongodb';

export async function getDashboardData({ teamId, applicationId = '' }) {
  const db = await getDb();
  const match = applicationId ? { teamId, applicationId } : { teamId };

  const passExpr = { $cond: [{ $eq: ['$status', 'Pass'] }, 1, 0] };
  const failExpr = { $cond: [{ $eq: ['$status', 'Fail'] }, 1, 0] };

  const [[agg], applications, modules] = await Promise.all([
    db.collection('testCases').aggregate([
      { $match: match },
      {
        $facet: {
          summary:  [{ $group: { _id: null, total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } }],
          byModule: [{ $group: { _id: '$moduleId', total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } }],
          byApp:    [{ $group: { _id: '$applicationId', total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } }],
          byTester: [{ $group: { _id: { $ifNull: ['$testedBy', ''] }, total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } }],
        },
      },
    ]).toArray(),
    db.collection('applications').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
    db.collection('modules').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
  ]);

  const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
  const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

  const s = agg.summary[0] ?? { total: 0, passed: 0, failed: 0 };
  const { total, passed, failed } = s;
  const pending = total - passed - failed;

  const toGroups = (rows, nameOf, fallback) =>
    Object.fromEntries(rows.map(({ _id, total: t, passed: p, failed: f }) => [
      nameOf(_id) || fallback,
      { total: t, passed: p, failed: f, pending: t - p - f },
    ]));

  return {
    summary: {
      total, passed, failed, pending,
      passPercent: total ? parseFloat(((passed / total) * 100).toFixed(1)) : 0,
      failPercent: total ? parseFloat(((failed / total) * 100).toFixed(1)) : 0,
    },
    moduleGroups:     toGroups(agg.byModule, (id) => modMap[id], 'Unknown'),
    moduleGroupsById: Object.fromEntries(agg.byModule.map(({ _id, total: t, passed: p, failed: f }) => [_id, { total: t, passed: p, failed: f, pending: t - p - f }])),
    appGroups:        toGroups(agg.byApp,    (id) => appMap[id], 'Unknown'),
    testerGroups:     toGroups(agg.byTester, (id) => id,         'Unassigned'),
  };
}

export async function getDashboardSettings({ teamId }) {
  const db = await getDb();
  const s = await db.collection('teamSettings').findOne(
    { teamId },
    { projection: { softwareVersion: 1 } },
  );
  return { softwareVersion: s?.softwareVersion || '' };
}
