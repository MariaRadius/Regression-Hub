import { getDb } from '@/lib/mongodb';

export async function getApplications({ teamId }) {
  if (!teamId) throw new Error('teamId required');
  const db = await getDb();
  const applications = await db
    .collection('applications')
    .find({ teamId })
    .sort({ name: 1 })
    .toArray();
  return applications.map((a) => ({ ...a, _id: a._id.toString() }));
}
