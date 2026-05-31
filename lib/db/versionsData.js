import { STATUS } from '@/lib/constants';
import { ApiError } from '@/lib/errors';

export async function getVersions(db, teamId) {
  if (!teamId) throw new Error('teamId required');

  const passExpr = { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] };
  const failExpr = { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] };

  const currentPipeline = [
    { $match: { teamId, softwareVersionTested: { $exists: true, $ne: '' } } },
    {
      $group: {
        _id: '$softwareVersionTested',
        total: { $sum: 1 },
        passed: { $sum: passExpr },
        failed: { $sum: failExpr },
        lastUpdated: { $max: '$updatedAt' },
      },
    },
  ];

  const historyPipeline = [
    { $match: { teamId, 'history.version': { $exists: true, $ne: '' } } },
    { $unwind: '$history' },
    { $match: { 'history.version': { $exists: true, $ne: '' } } },
    {
      $group: {
        _id: '$history.version',
        total: { $sum: 1 },
        passed: {
          $sum: { $cond: [{ $eq: ['$history.status', STATUS.PASS] }, 1, 0] },
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$history.status', STATUS.FAIL] }, 1, 0] },
        },
        lastUpdated: { $max: '$history.snapshotAt' },
      },
    },
  ];

  const [currentRows, historyRows, settings] = await Promise.all([
    db.collection('testCases').aggregate(currentPipeline).toArray(),
    db.collection('testCases').aggregate(historyPipeline).toArray(),
    db
      .collection('teamSettings')
      .findOne({ teamId }, { projection: { completedVersions: 1 } }),
  ]);

  const completedSet = new Set(settings?.completedVersions || []);
  const versionMap = new Map();
  for (const r of historyRows)
    versionMap.set(r._id, { ...r, isCurrent: false });
  for (const r of currentRows)
    versionMap.set(r._id, { ...r, isCurrent: !completedSet.has(r._id) });

  return [...versionMap.values()]
    .map((r) => ({
      version: r._id,
      total: r.total,
      passed: r.passed,
      failed: r.failed,
      pending: r.total - r.passed - r.failed,
      passRate: r.total ? Math.round((r.passed / r.total) * 100) : 0,
      lastUpdated: r.lastUpdated,
      isCurrent: r.isCurrent,
    }))
    .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
}

export async function deleteVersion(db, teamId, version, isCurrent) {
  if (!teamId) throw new Error('teamId required');
  if (!version) throw new Error('version required');
  if (isCurrent) {
    const result = await db
      .collection('testCases')
      .deleteMany({ teamId, softwareVersionTested: version });
    return { deleted: result.deletedCount };
  }
  const result = await db
    .collection('testCases')
    .updateMany(
      { teamId, 'history.version': version },
      { $pull: { history: { version } } },
    );
  return { deleted: result.modifiedCount };
}

export async function completeVersion(db, teamId, version) {
  if (!teamId) throw new Error('teamId required');
  if (!version) throw new Error('version required');
  const now = new Date();

  const testCases = await db
    .collection('testCases')
    .find(
      { teamId, softwareVersionTested: version },
      {
        projection: {
          _id: 1,
          status: 1,
          testedBy: 1,
          testedOn: 1,
          notes: 1,
          testRunId: 1,
          history: 1,
        },
      },
    )
    .toArray();

  if (testCases.length) {
    const bulkOps = testCases.map((tc) => {
      const snapshot = {
        version,
        status: tc.status || '',
        testedBy: tc.testedBy || '',
        testedOn: tc.testedOn || '',
        notes: tc.notes || '',
        testRunId: tc.testRunId || '',
        snapshotAt: now,
      };
      const newHistory = [
        ...(tc.history || []).filter((h) => h.version !== version),
        snapshot,
      ];
      return {
        updateOne: {
          filter: { _id: tc._id, teamId },
          update: { $set: { history: newHistory } },
        },
      };
    });
    await db.collection('testCases').bulkWrite(bulkOps, { ordered: false });
  }

  await db
    .collection('teamSettings')
    .updateOne(
      { teamId },
      { $addToSet: { completedVersions: version } },
      { upsert: true },
    );

  return { snapshotted: testCases.length };
}

export async function restoreVersion(db, teamId, version) {
  if (!teamId) throw new Error('teamId required');
  if (!version) throw new Error('version required');
  const now = new Date();

  const allTestCases = await db
    .collection('testCases')
    .find(
      { teamId },
      {
        projection: {
          _id: 1,
          softwareVersionTested: 1,
          status: 1,
          testedBy: 1,
          testedOn: 1,
          notes: 1,
          testRunId: 1,
          history: 1,
        },
      },
    )
    .toArray();

  if (!allTestCases.length) throw new ApiError(404, 'No test cases found');

  const displacedVersions = [
    ...new Set(
      allTestCases
        .map((tc) => tc.softwareVersionTested)
        .filter((v) => v && v !== version),
    ),
  ];

  const bulkOps = allTestCases
    .map((tc) => {
      const currentVer = tc.softwareVersionTested || '';
      if (currentVer === version) return null;
      const histEntry = (tc.history || []).find((h) => h.version === version);
      const newHistory = (tc.history || []).filter(
        (h) => h.version !== version,
      );
      if (currentVer && (tc.status || tc.testedBy || tc.notes)) {
        newHistory.push({
          version: currentVer,
          status: tc.status || '',
          testedBy: tc.testedBy || '',
          testedOn: tc.testedOn || '',
          notes: tc.notes || '',
          testRunId: tc.testRunId || '',
          snapshotAt: now,
        });
      }
      return {
        updateOne: {
          filter: { _id: tc._id, teamId },
          update: {
            $set: {
              softwareVersionTested: version,
              status: histEntry?.status ?? '',
              testedBy: histEntry?.testedBy ?? '',
              testedOn: histEntry?.testedOn ?? '',
              notes: histEntry?.notes ?? '',
              history: newHistory,
              updatedAt: now,
            },
          },
        },
      };
    })
    .filter(Boolean);

  let restoredCount = 0;
  if (bulkOps.length) {
    const result = await db
      .collection('testCases')
      .bulkWrite(bulkOps, { ordered: false });
    restoredCount = result.modifiedCount;
  }

  await db.collection('teamSettings').updateOne(
    { teamId },
    {
      $set: { softwareVersion: version },
      $pull: { completedVersions: version },
    },
    { upsert: true },
  );
  for (const v of displacedVersions) {
    await db
      .collection('teamSettings')
      .updateOne(
        { teamId },
        { $addToSet: { completedVersions: v } },
        { upsert: true },
      );
  }

  return { restored: restoredCount };
}

/**
 * Returns a `$group` aggregation stage that counts total, passed, and failed
 * test-history entries, grouped by the given `_id` expression.
 *
 * @param {*} id - MongoDB `_id` expression for the group key
 */
function statusGroupStage(id) {
  return {
    $group: {
      _id: id,
      total: { $sum: 1 },
      passed: {
        $sum: { $cond: [{ $eq: ['$h.status', STATUS.PASS] }, 1, 0] },
      },
      failed: {
        $sum: { $cond: [{ $eq: ['$h.status', STATUS.FAIL] }, 1, 0] },
      },
    },
  };
}

export async function getVersionHistoryDetail(db, teamId, version) {
  if (!teamId) throw new Error('teamId required');
  if (!version) throw new Error('version required');

  const [modules, [agg]] = await Promise.all([
    db
      .collection('modules')
      .find({ teamId }, { projection: { _id: 1, name: 1 } })
      .toArray(),
    db
      .collection('testCases')
      .aggregate([
        { $match: { teamId, 'history.version': version } },
        {
          $project: {
            moduleId: 1,
            h: {
              $filter: {
                input: '$history',
                as: 'h',
                cond: { $eq: ['$$h.version', version] },
              },
            },
          },
        },
        { $unwind: '$h' },
        {
          $facet: {
            summary: [statusGroupStage(null)],
            byModule: [statusGroupStage('$moduleId')],
            byTester: [statusGroupStage({ $ifNull: ['$h.testedBy', ''] })],
          },
        },
      ])
      .toArray(),
  ]);

  const modMap = Object.fromEntries(
    modules.map((m) => [m._id.toString(), m.name]),
  );
  const s = agg?.summary[0] ?? { total: 0, passed: 0, failed: 0 };

  return {
    version,
    summary: {
      total: s.total,
      passed: s.passed,
      failed: s.failed,
      pending: s.total - s.passed - s.failed,
      passRate: s.total ? Math.round((s.passed / s.total) * 100) : 0,
    },
    byModule: (agg?.byModule ?? [])
      .map((r) => ({
        module: modMap[r._id] || 'Unknown',
        total: r.total,
        passed: r.passed,
        failed: r.failed,
        pending: r.total - r.passed - r.failed,
        passRate: r.total ? Math.round((r.passed / r.total) * 100) : 0,
      }))
      .sort((a, b) => a.module.localeCompare(b.module)),
    byTester: (agg?.byTester ?? [])
      .map((r) => ({
        tester: r._id || 'Unassigned',
        total: r.total,
        passed: r.passed,
        failed: r.failed,
        pending: r.total - r.passed - r.failed,
      }))
      .sort((a, b) => b.total - a.total),
  };
}
