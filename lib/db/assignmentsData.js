import { ObjectId } from 'mongodb';
import {
  ASSIGNMENT_STATUS,
  AUDIT_ACTION,
  COMPLETED_STATUSES,
  PRIORITY_DEFAULT,
} from '@/lib/constants';
import { appendAssignmentEvents } from '@/lib/db/eventsData';
import { ApiError } from '@/lib/errors';

/**
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function getAssignmentsPageData(db, teamId, { userName, view }) {
  const assignmentQuery = { teamId };
  if (view === 'sent') assignmentQuery.assignedBy = userName;
  else assignmentQuery.assignedTo = userName;

  const [assignmentsRaw, modulesRaw, applications, users] = await Promise.all([
    db
      .collection('assignments')
      .find(assignmentQuery)
      .sort({ createdAt: -1 })
      .toArray(),
    db.collection('modules').find({ teamId }).toArray(),
    db
      .collection('applications')
      .find({ teamId }, { projection: { _id: 1, name: 1 } })
      .toArray(),
    db
      .collection('users')
      .find(
        { teamId, active: { $ne: false } },
        { projection: { _id: 0, name: 1 } },
      )
      .sort({ name: 1 })
      .toArray(),
  ]);

  const appMap = Object.fromEntries(
    applications.map((a) => [a._id.toString(), a.name]),
  );
  const modules = modulesRaw
    .map((m) => ({
      _id: m._id.toString(),
      name: m.name,
      applicationId:
        typeof m.applicationId === 'string'
          ? m.applicationId
          : (m.applicationId?.toString() ?? ''),
      applicationName: appMap[m.applicationId] || 'Unknown',
    }))
    .sort((a, b) => {
      const appCmp = a.applicationName.localeCompare(b.applicationName);
      return appCmp !== 0 ? appCmp : a.name.localeCompare(b.name);
    });

  const moduleIds = modules.map((m) => m._id);
  const countsAgg = moduleIds.length
    ? await db
        .collection('testCases')
        .aggregate([
          { $match: { teamId, moduleId: { $in: moduleIds } } },
          { $group: { _id: '$moduleId', total: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const moduleCounts = Object.fromEntries(
    countsAgg.map((r) => [r._id, r.total]),
  );
  for (const id of moduleIds) if (!(id in moduleCounts)) moduleCounts[id] = 0;

  const oidMap = new Map();
  assignmentsRaw.forEach((a) => {
    (a.testCaseIds || []).forEach((id) => {
      if (!oidMap.has(id)) {
        try {
          oidMap.set(id, new ObjectId(id));
        } catch {
          /* skip */
        }
      }
    });
  });
  const allOids = [...oidMap.values()];
  const completedSet = new Set();
  if (allOids.length) {
    const completedDocs = await db
      .collection('testCases')
      .find(
        { _id: { $in: allOids }, status: { $in: COMPLETED_STATUSES } },
        { projection: { _id: 1 } },
      )
      .toArray();
    for (const doc of completedDocs) completedSet.add(doc._id.toString());
  }

  const assignments = assignmentsRaw.map((a) => ({
    ...a,
    _id: a._id.toString(),
    dueDate: a.dueDate ? a.dueDate.toISOString() : null,
    createdAt: a.createdAt?.toISOString() ?? null,
    updatedAt: a.updatedAt?.toISOString() ?? null,
    completedCount: (a.testCaseIds || []).filter((id) => completedSet.has(id))
      .length,
  }));

  return {
    assignments,
    modules,
    moduleCounts,
    qaUsers: users.map((u) => u.name),
  };
}

/**
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function listAssignments(db, teamId, { view, userName }) {
  const query = { teamId };
  if (view === 'mine') query.assignedTo = userName;
  else if (view === 'sent') query.assignedBy = userName;

  const assignments = await db
    .collection('assignments')
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();

  if (assignments.length === 0) return [];

  // Collect all test-case ObjectIds across all assignments
  const oidMap = new Map(); // string id → ObjectId (deduped)
  for (const a of assignments) {
    for (const id of a.testCaseIds || []) {
      if (!oidMap.has(id)) {
        try {
          oidMap.set(id, new ObjectId(id));
        } catch {
          /* skip invalid ids */
        }
      }
    }
  }

  // Single batch aggregate: match completed test cases, project only _id
  const completedSet = new Set();
  if (oidMap.size > 0) {
    const rows = await db
      .collection('testCases')
      .aggregate([
        {
          $match: {
            _id: { $in: [...oidMap.values()] },
            status: { $in: COMPLETED_STATUSES },
          },
        },
        { $project: { _id: 1 } },
      ])
      .toArray();
    for (const row of rows) completedSet.add(row._id.toString());
  }

  return assignments.map((a) => ({
    ...a,
    _id: a._id.toString(),
    completedCount: (a.testCaseIds || []).filter((id) => completedSet.has(id))
      .length,
  }));
}

/**
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function createAssignment(db, teamId, body, { assignedBy }) {
  const {
    title,
    type,
    moduleIds,
    testCaseIds: rawIds,
    assignedTo,
    priority,
    dueDate,
    notes,
  } = body;
  if (!assignedTo) throw new ApiError(400, 'assignedTo is required');

  let resolvedIds = [];
  let resolvedModuleIds = [];

  if (type === 'module' && moduleIds?.length) {
    resolvedModuleIds = moduleIds;
    const cases = await db
      .collection('testCases')
      .find(
        { teamId, moduleId: { $in: moduleIds } },
        { projection: { _id: 1 } },
      )
      .toArray();
    resolvedIds = cases.map((c) => c._id.toString());
  } else if (type === 'selection' && rawIds?.length) {
    resolvedIds = rawIds;
  } else {
    throw new ApiError(
      400,
      'Provide moduleIds (module type) or testCaseIds (selection type)',
    );
  }

  if (resolvedIds.length === 0) {
    throw new ApiError(400, 'No test cases found for this assignment');
  }

  const now = new Date();
  const doc = {
    teamId,
    title:
      title?.trim() ||
      (type === 'module'
        ? 'Module Assignment'
        : `${resolvedIds.length} Test Cases`),
    type,
    moduleIds: resolvedModuleIds,
    testCaseIds: resolvedIds,
    testCaseCount: resolvedIds.length,
    assignedTo,
    assignedBy,
    priority: priority || PRIORITY_DEFAULT,
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: notes || '',
    status: ASSIGNMENT_STATUS.ACTIVE,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection('assignments').insertOne(doc);
  const assignmentId = result.insertedId.toString();

  const oids = resolvedIds.map((id) => new ObjectId(id));
  await db
    .collection('testCases')
    .updateMany(
      { _id: { $in: oids } },
      { $set: { assignedTo, assignmentId, updatedAt: now } },
    );

  await appendAssignmentEvents(db, teamId, {
    action: AUDIT_ACTION.ASSIGN,
    testCaseIds: resolvedIds,
    assignmentId,
    assignedTo,
    by: assignedBy,
    at: now,
  });

  return { ok: true, id: assignmentId, testCaseCount: resolvedIds.length };
}

export async function updateAssignment(db, teamId, id, patch) {
  const assignment = await db.collection('assignments').findOne({
    _id: new ObjectId(id),
    teamId,
  });
  if (!assignment) throw new ApiError(404, 'Not found');

  const update = { updatedAt: new Date() };
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.dueDate !== undefined)
    update.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  if (patch.status !== undefined) update.status = patch.status;

  await db
    .collection('assignments')
    .updateOne({ _id: new ObjectId(id) }, { $set: update });
  return { ok: true };
}

/**
 * @see {@link lib/__tests__/db/assignmentsData.test.js}
 */
export async function deleteAssignment(db, teamId, id, { actor } = {}) {
  const assignment = await db.collection('assignments').findOne({
    _id: new ObjectId(id),
    teamId,
  });
  if (!assignment) throw new ApiError(404, 'Not found');

  const oids = (assignment.testCaseIds || [])
    .map((tcId) => {
      try {
        return new ObjectId(tcId);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (oids.length > 0) {
    await db.collection('testCases').updateMany(
      { _id: { $in: oids }, assignmentId: id },
      {
        $unset: { assignedTo: '', assignmentId: '' },
        $set: { updatedAt: new Date() },
      },
    );
  }

  await db.collection('assignments').deleteOne({ _id: new ObjectId(id) });

  await appendAssignmentEvents(db, teamId, {
    action: AUDIT_ACTION.UNASSIGN,
    testCaseIds: assignment.testCaseIds || [],
    assignmentId: id,
    assignedTo: assignment.assignedTo,
    by: actor ?? null,
    at: new Date(),
  });

  return { ok: true };
}
