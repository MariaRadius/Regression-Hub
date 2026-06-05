import { STATUS } from '@/lib/constants';
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

  const releaseFilter = { teamId };
  if (releaseId) releaseFilter.releaseId = releaseId;

  const selectedEnvFilter = { ...releaseFilter };
  if (environment) selectedEnvFilter.environment = environment;

  const [releaseResults, selectedEnvResults, { appMap, modMap }] =
    await Promise.all([
      db.collection('testResults').find(releaseFilter).toArray(),
      db.collection('testResults').find(selectedEnvFilter).toArray(),
      fetchAppModMaps(db, teamId),
    ]);

  if (!releaseResults.length) return [];

  const tcIds = [...new Set(releaseResults.map((r) => r.tcId).filter(Boolean))];
  const caseDocs = await db
    .collection('testCases')
    .find({ _id: idsMatch(tcIds) })
    .toArray();

  const caseMap = Object.fromEntries(caseDocs.map((c) => [String(c._id), c]));
  const resultMap = Object.fromEntries(
    selectedEnvResults.map((r) => [String(r.tcId), r]),
  );

  return tcIds.map((tcId) => {
    const tc = caseMap[String(tcId)] ?? {};
    const result = resultMap[String(tcId)] ?? null;
    return {
      ...toClientDoc(tc),
      ...toClientDoc(result),
      applicationName: appMap[String(tc.applicationId)] || 'Unknown',
      moduleName: modMap[String(tc.moduleId)] || 'Unknown',
      environment,
      status: result?.status ?? STATUS.PENDING,
      testedBy: result?.testedBy ?? null,
      testedOn:
        result?.testedOn instanceof Date
          ? result.testedOn.toISOString()
          : (result?.testedOn ?? null),
      notes: result?.notes ?? null,
    };
  });
}
