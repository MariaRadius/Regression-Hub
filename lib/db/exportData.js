import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { toClientDoc } from '@/lib/db/util';

export async function getExportData(db, teamId, query = {}) {
  const { releaseId = '', environment = '', applicationId = '' } = query;

  const liveQuery = { teamId };
  if (releaseId) liveQuery.releaseId = releaseId;
  if (applicationId) liveQuery.applicationId = applicationId;

  const [results, { appMap, modMap }] = await Promise.all([
    db
      .collection('testResults')
      .find(liveQuery)
      .sort({ createdAt: 1 })
      .toArray(),
    fetchAppModMaps(db, teamId),
  ]);

  return results.map((r) => ({
    ...toClientDoc(r),
    applicationName: appMap[r.applicationId] || 'Unknown',
    moduleName: modMap[r.moduleId] || 'Unknown',
    environment: environment || r.environment || '',
  }));
}
