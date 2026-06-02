import { ObjectId } from 'mongodb';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

export async function listApplications(db, teamId) {
  if (!teamId) throw new Error('teamId required');
  const applications = await db
    .collection('applications')
    .find({ teamId })
    .sort({ name: 1 })
    .toArray();
  return applications.map((a) => toClientDoc(a));
}

/**
 * Deletes a team application by id.
 * Throws ApiError(409) if any test case still references it.
 *
 * @see {@link app/api/applications/[id]/__tests__/route.test.js}
 */
export async function deleteApplication(db, teamId, id) {
  if (!teamId) throw new Error('teamId required');
  const referenced = await db
    .collection('testCases')
    .countDocuments({ teamId, applicationId: id });
  if (referenced > 0) {
    throw new ApiError(409, 'Application is still referenced by test cases');
  }
  await db
    .collection('applications')
    .deleteOne({ _id: new ObjectId(id), teamId });
}
