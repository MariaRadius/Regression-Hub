/**
 * DB layer for jiraStoryWatches collection.
 *
 * Each document tracks one (teamId, storyKey) pair and records the last
 * known Jira `updated` timestamp alongside when the team last acknowledged
 * the change. A story is "stale" when jiraUpdatedAt > acknowledgedAt.
 */

/**
 * Returns all distinct jiraStory values linked to the team's test cases.
 * Blank/null values are excluded.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @returns {Promise<string[]>}
 */
export async function listDistinctStoryKeys(db, teamId) {
  return db
    .collection('testCases')
    .distinct('jiraStory', { teamId, jiraStory: { $nin: ['', null] } });
}

/**
 * Returns all watch documents for a team.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @returns {Promise<Array<{teamId:string, storyKey:string, jiraUpdatedAt:Date|null, jiraSummary:string, jiraCheckedAt:Date|null, acknowledgedAt:Date|null}>>}
 */
export async function listStoryWatches(db, teamId) {
  return db.collection('jiraStoryWatches').find({ teamId }).toArray();
}

/**
 * Upserts the Jira snapshot for a single story key.
 * Does NOT overwrite acknowledgedAt — a prior dismiss is preserved when
 * Jira returns the same timestamp.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ storyKey: string, jiraUpdatedAt: Date, jiraSummary: string }} data
 */
export async function upsertStoryWatch(
  db,
  teamId,
  { storyKey, jiraUpdatedAt, jiraSummary },
) {
  if (!teamId) throw new Error('teamId required');
  await db
    .collection('jiraStoryWatches')
    .updateOne(
      { teamId, storyKey },
      { $set: { jiraUpdatedAt, jiraSummary, jiraCheckedAt: new Date() } },
      { upsert: true },
    );
}

/**
 * Marks a single story as acknowledged (banner dismissed).
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {string} storyKey
 */
export async function acknowledgeStoryWatch(db, teamId, storyKey) {
  await db
    .collection('jiraStoryWatches')
    .updateOne({ teamId, storyKey }, { $set: { acknowledgedAt: new Date() } });
}

/**
 * Marks all stories for a team as acknowledged ("Dismiss all").
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 */
export async function acknowledgeAllStoryWatches(db, teamId) {
  await db
    .collection('jiraStoryWatches')
    .updateMany({ teamId }, { $set: { acknowledgedAt: new Date() } });
}
