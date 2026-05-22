import { getDb } from '@/lib/mongodb';

export async function getTeamSettings({ teamId }) {
  if (!teamId) throw new Error('teamId required');
  const db = await getDb();
  const [settings, users] = await Promise.all([
    db.collection('teamSettings').findOne(
      { teamId },
      { projection: { testEnvironment: 1, softwareVersion: 1 } }
    ),
    db.collection('users')
      .find({ teamId, active: { $ne: false } }, { projection: { name: 1 } })
      .sort({ name: 1 })
      .toArray(),
  ]);
  return {
    ...(settings || {}),
    qaUsers: users.map((u) => u.name),
  };
}

export async function updateTeamSettings({ teamId, patch }) {
  if (!teamId) throw new Error('teamId required');
  const db = await getDb();
  const update = { updatedAt: new Date() };
  if (patch.testEnvironment !== undefined) update.testEnvironment = patch.testEnvironment;
  if (patch.softwareVersion !== undefined) update.softwareVersion = patch.softwareVersion;
  await db.collection('teamSettings').updateOne(
    { teamId },
    { $set: update },
    { upsert: true }
  );
}
