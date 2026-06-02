import { fetchAppModMaps } from '@/lib/db/appModMaps';
import { idsMatch } from '@/lib/db/idQuery';
import { toClientDoc } from '@/lib/db/util';

/**
 * Returns export rows for a given (teamId, releaseId, environment) by joining
 * testResults (execution state) with testCases (definition fields).
 *
 * Assumptions:
 * - testResults carries status/testedBy/testedOn/notes/assignedTo but NOT
 *   applicationId or moduleId — those live only on testCases.
 * - testResults.tcId is the string form of the testCases._id ObjectId.
 * - environment is required to scope the result rows correctly.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId?: string, environment?: string }} query
 */
export async function getExportData(db, teamId, query = {}) {
  const { releaseId = '', environment = '' } = query;

  const resultFilter = { teamId };
  if (releaseId) resultFilter.releaseId = releaseId;
  if (environment) resultFilter.environment = environment;

  const [results, { appMap, modMap }] = await Promise.all([
    db
      .collection('testResults')
      .find(resultFilter)
      .sort({ createdAt: 1 })
      .toArray(),
    fetchAppModMaps(db, teamId),
  ]);

  if (!results.length) return [];

  const tcIds = results.map((r) => r.tcId);
  const caseDocs = await db
    .collection('testCases')
    .find({ _id: idsMatch(tcIds) })
    .toArray();

  const caseMap = Object.fromEntries(caseDocs.map((c) => [String(c._id), c]));

  return results.map((r) => {
    const tc = caseMap[String(r.tcId)] ?? {};
    return {
      ...toClientDoc(tc),
      ...toClientDoc(r),
      applicationName: appMap[String(tc.applicationId)] || 'Unknown',
      moduleName: modMap[String(tc.moduleId)] || 'Unknown',
    };
  });
}
