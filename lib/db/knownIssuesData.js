import { unstable_cache } from 'next/cache';
import { CACHE_TTL, STATUS } from '@/lib/constants';
import { getDb } from '@/lib/mongodb';

/**
 * Aggregates every Known Issue result for one release into an environment
 * breakdown. Scoped to the release (NOT the active environment): the result
 * covers every environment the release defines, plus any environment that still
 * holds a known issue (so counts are never silently dropped when an environment
 * was later removed). Each cell carries the count and the projected list of
 * known-issue cases for that environment.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} releaseId
 * @returns {Promise<{
 *   releaseId: string,
 *   releaseName: string | null,
 *   environments: string[],
 *   total: number,
 *   cells: Record<string, { count: number, cases: Array<{ tcId: string, testKey: string, testCaseName: string, jiraKeys: string[] }> }>,
 * }>}
 * @see {@link lib/__tests__/db/knownIssuesData.test.js}
 */
export async function getReleaseKnownIssues(db, teamId, releaseId) {
  const [rows, release] = await Promise.all([
    db
      .collection('testResults')
      .aggregate([
        { $match: { teamId, releaseId, status: STATUS.KNOWN_ISSUE } },
        {
          $lookup: {
            from: 'testCases',
            let: { tcId: '$tcId' },
            pipeline: [
              {
                $match: { $expr: { $eq: ['$_id', { $toObjectId: '$$tcId' }] } },
              },
              { $project: { _id: 0, testKey: 1, testCase: 1 } },
            ],
            as: '_tc',
          },
        },
        {
          $group: {
            _id: '$environment',
            count: { $sum: 1 },
            cases: {
              $push: {
                tcId: '$tcId',
                testKey: { $ifNull: [{ $first: '$_tc.testKey' }, '—'] },
                testCaseName: {
                  $ifNull: [{ $first: '$_tc.testCase' }, 'Untitled'],
                },
                jiraKeys: { $ifNull: ['$jiraIssueKeys', []] },
              },
            },
          },
        },
      ])
      .toArray(),
    db
      .collection('releases')
      .findOne(
        { teamId, _id: releaseId },
        { projection: { name: 1, environments: 1 } },
      ),
  ]);

  if (!release) {
    return {
      releaseId,
      releaseName: null,
      environments: [],
      total: 0,
      cells: {},
    };
  }

  // Index aggregation rows by environment → { count, cases }.
  const byEnv = {};
  let total = 0;
  for (const row of rows) {
    if (!row._id) continue;
    total += row.count;
    byEnv[row._id] = { count: row.count, cases: row.cases ?? [] };
  }

  // Columns = envs the release defines ∪ envs that still hold a known issue.
  const definedEnvs = release.environments ?? [];
  const envSet = new Set([...definedEnvs, ...Object.keys(byEnv)]);
  const cells = {};
  for (const env of envSet) {
    cells[env] = byEnv[env] ?? { count: 0, cases: [] };
  }

  return {
    releaseId,
    releaseName: release.name ?? 'Untitled',
    environments: [...envSet].sort((a, b) => a.localeCompare(b)),
    total,
    cells,
  };
}

// Cached variant — mirrors getCachedDashboardData. Invalidated by the
// `revalidatePath('/dashboard')` already issued from the result-recording route
// (Known Issues are recorded through that route). Bump the version suffix if the
// returned shape changes.
const _getCachedReleaseKnownIssuesFn = unstable_cache(
  async (teamId, releaseId) => {
    const db = await getDb();
    return getReleaseKnownIssues(db, teamId, releaseId);
  },
  ['release-known-issues-v1'],
  { revalidate: CACHE_TTL.SHORT },
);

export const getCachedReleaseKnownIssues = (teamId, releaseId) =>
  _getCachedReleaseKnownIssuesFn(teamId, releaseId);
