import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { toClientDoc } from '@/lib/db/util';

export async function getExportData(db, teamId, query = {}) {
  const { applicationId = '', testRunId = '', softwareVersion = '' } = query;

  const liveQuery = { teamId };
  if (applicationId) liveQuery.applicationId = applicationId;
  if (testRunId) liveQuery.testRunId = testRunId;
  if (softwareVersion) liveQuery.softwareVersionTested = softwareVersion;

  const [liveTestCases, { appMap, modMap }] = await Promise.all([
    db.collection('testCases').find(liveQuery).sort({ createdAt: 1 }).toArray(),
    fetchAppModMaps(db, teamId),
  ]);

  let testCases = liveTestCases;

  if (softwareVersion && liveTestCases.length === 0) {
    const histQuery = { teamId, 'history.version': softwareVersion };
    if (applicationId) histQuery.applicationId = applicationId;

    const historicalDocs = await db
      .collection('testCases')
      .find(histQuery)
      .sort({ createdAt: 1 })
      .toArray();

    testCases = historicalDocs.map((tc) => {
      const snap =
        (tc.history || []).find((h) => h.version === softwareVersion) || {};
      return {
        ...tc,
        status: snap.status ?? tc.status,
        testedBy: snap.testedBy ?? tc.testedBy,
        testedOn: snap.testedOn ?? tc.testedOn,
        notes: snap.notes ?? tc.notes,
        softwareVersionTested: softwareVersion,
      };
    });
  }

  return testCases.map((tc) => ({
    ...toClientDoc(tc),
    applicationName: appMap[tc.applicationId] || 'Unknown',
    moduleName: modMap[tc.moduleId] || 'Unknown',
  }));
}
