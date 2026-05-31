/**
 * Fetches applications and modules for a team and returns lookup maps.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @returns {Promise<{
 *   appMap: Record<string, string>,
 *   modMap: Record<string, string>,
 *   applications: Array<{_id: import('mongodb').ObjectId, name: string}>,
 *   modules: Array<{_id: import('mongodb').ObjectId, name: string, applicationId?: import('mongodb').ObjectId}>,
 * }>}
 */
export async function fetchAppModMaps(db, teamId) {
  const [applications, modules] = await Promise.all([
    db
      .collection('applications')
      .find({ teamId }, { projection: { _id: 1, name: 1 } })
      .toArray(),
    db
      .collection('modules')
      .find({ teamId }, { projection: { _id: 1, name: 1, applicationId: 1 } })
      .toArray(),
  ]);

  const appMap = Object.fromEntries(
    applications.map((a) => [a._id.toString(), a.name]),
  );
  const modMap = Object.fromEntries(
    modules.map((m) => [m._id.toString(), m.name]),
  );

  return { appMap, modMap, applications, modules };
}
