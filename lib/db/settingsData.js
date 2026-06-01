export async function getTeamSettings(db, teamId) {
  if (!teamId) throw new Error('teamId required');
  const users = await db
    .collection('users')
    .find({ teamId, active: { $ne: false } }, { projection: { name: 1 } })
    .sort({ name: 1 })
    .toArray();
  return {
    qaUsers: users.map((u) => u.name),
  };
}
