import { getDb } from '@/lib/mongodb';

export async function getUsers({ teamId }) {
  if (!teamId) throw new Error('teamId required');
  const db = await getDb();
  const users = await db.collection('users')
    .find({ teamId }, { projection: { passwordHash: 0 } })
    .sort({ role: 1, name: 1 })
    .toArray();
  return users.map((u) => ({ ...u, _id: u._id.toString() }));
}
