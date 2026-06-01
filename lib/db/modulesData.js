import { ObjectId } from 'mongodb';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

export async function listModules(db, teamId, { applicationId } = {}) {
  const modules = await db.collection('modules').find({ teamId }).toArray();
  const applications = await db
    .collection('applications')
    .find({ teamId })
    .toArray();
  const appMap = Object.fromEntries(
    applications.map((a) => [a._id.toString(), a.name]),
  );

  let enriched = modules
    .map((m) => ({
      ...toClientDoc(m),
      applicationName: appMap[m.applicationId] || 'Unknown',
    }))
    .sort((a, b) => {
      const appCmp = a.applicationName.localeCompare(b.applicationName);
      return appCmp !== 0 ? appCmp : a.name.localeCompare(b.name);
    });

  if (applicationId) {
    enriched = enriched.filter((m) => m.applicationId === applicationId);
  }

  return enriched;
}

export async function createModule(db, teamId, { name, applicationId }) {
  const app = await db.collection('applications').findOne({
    _id: new ObjectId(applicationId),
    teamId,
  });
  if (!app) throw new ApiError(404, 'Application not found');

  const doc = {
    name: name.trim(),
    applicationId,
    teamId,
    createdAt: new Date(),
  };
  try {
    const result = await db.collection('modules').insertOne(doc);
    return {
      _id: result.insertedId.toString(),
      name: doc.name,
      applicationId,
      applicationName: app.name,
      teamId,
    };
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'Module already exists');
    throw err;
  }
}

/**
 * Deletes a module by id after verifying no test cases reference it.
 *
 * @throws {ApiError} 404 if the module does not exist for this team
 * @throws {ApiError} 409 if any test case still references the module
 * @see {@link app/api/modules/[id]/__tests__/route.test.js}
 */
export async function deleteModule(db, teamId, id) {
  const existing = await db
    .collection('modules')
    .findOne({ _id: new ObjectId(id), teamId });
  if (!existing) throw new ApiError(404, 'Module not found');

  const refCount = await db
    .collection('testCases')
    .countDocuments({ moduleId: id, teamId });
  if (refCount > 0)
    throw new ApiError(409, 'Module is still referenced by test cases');

  await db.collection('modules').deleteOne({ _id: new ObjectId(id), teamId });
}
