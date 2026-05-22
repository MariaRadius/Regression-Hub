// lib/assignmentsData.js
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';

export async function getAssignmentsPageData({ teamId, userName, view }) {
  const db = await getDb();

  const assignmentQuery = { teamId };
  if (view === 'sent') assignmentQuery.assignedBy = userName;
  else assignmentQuery.assignedTo = userName; // default = 'mine'

  const [assignmentsRaw, modulesRaw, applications, users] = await Promise.all([
    db.collection('assignments').find(assignmentQuery).sort({ createdAt: -1 }).toArray(),
    db.collection('modules').find({ teamId }).toArray(),
    db.collection('applications').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
    db.collection('users')
      .find({ teamId, active: { $ne: false } }, { projection: { _id: 0, name: 1 } })
      .sort({ name: 1 })
      .toArray(),
  ]);

  // Enrich modules with applicationName (mirrors /api/modules)
  const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
  const modules = modulesRaw
    .map((m) => ({
      _id: m._id.toString(),
      name: m.name,
      applicationId: typeof m.applicationId === 'string' ? m.applicationId : m.applicationId?.toString() ?? '',
      applicationName: appMap[m.applicationId] || 'Unknown',
    }))
    .sort((a, b) => {
      const appCmp = a.applicationName.localeCompare(b.applicationName);
      return appCmp !== 0 ? appCmp : a.name.localeCompare(b.name);
    });

  // Per-module test-case counts via single aggregation (replaces N client fetches)
  const moduleIds = modules.map((m) => m._id);
  const countsAgg = moduleIds.length
    ? await db.collection('testCases').aggregate([
        { $match: { teamId, moduleId: { $in: moduleIds } } },
        { $group: { _id: '$moduleId', total: { $sum: 1 } } },
      ]).toArray()
    : [];
  const moduleCounts = Object.fromEntries(countsAgg.map((r) => [r._id, r.total]));
  for (const id of moduleIds) if (!(id in moduleCounts)) moduleCounts[id] = 0;

  // Batch-fetch completed test cases across all assignments by their stored testCaseIds
  const oidMap = new Map();
  assignmentsRaw.forEach((a) => {
    (a.testCaseIds || []).forEach((id) => {
      if (!oidMap.has(id)) {
        try { oidMap.set(id, new ObjectId(id)); } catch { /* skip invalid ids */ }
      }
    });
  });
  const allOids = [...oidMap.values()];
  const completedSet = new Set();
  if (allOids.length) {
    const completedDocs = await db.collection('testCases')
      .find(
        { _id: { $in: allOids }, status: { $in: ['Pass', 'Fail'] } },
        { projection: { _id: 1 } }
      )
      .toArray();
    completedDocs.forEach((doc) => completedSet.add(doc._id.toString()));
  }

  const assignments = assignmentsRaw.map((a) => ({
    ...a,
    _id: a._id.toString(),
    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    createdAt: a.createdAt?.toISOString() ?? null,
    updatedAt: a.updatedAt?.toISOString() ?? null,
    completedCount: (a.testCaseIds || []).filter((id) => completedSet.has(id)).length,
  }));

  const qaUsers = users.map((u) => u.name);

  return { assignments, modules, moduleCounts, qaUsers };
}
