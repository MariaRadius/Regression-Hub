import { ObjectId } from 'mongodb';
import { STATUS } from '@/lib/constants';
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

export async function getApplicationsPageData(db, teamId) {
  const [applications, dash] = await Promise.all([
    db.collection('applications').find({ teamId }).sort({ name: 1 }).toArray(),
    db
      .collection('testCases')
      .aggregate([
        { $match: { teamId } },
        {
          $group: {
            _id: '$applicationId',
            total: { $sum: 1 },
            passed: {
              $sum: { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] },
            },
            failed: {
              $sum: { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),
  ]);

  const appGroups = Object.fromEntries(
    dash.map(({ _id, total, passed, failed }) => [
      _id,
      { total, passed, failed, pending: total - passed - failed },
    ]),
  );

  const apps = applications.map((a) => ({
    _id: a._id.toString(),
    name: a.name,
  }));
  return { apps, appGroups };
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
