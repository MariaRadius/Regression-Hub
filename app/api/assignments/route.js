import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });

    const db = await getDb();
    const teamId = session.user.teamId;
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view') || 'mine';

    const query = { teamId };
    if (view === 'mine') query.assignedTo = session.user.name;
    else if (view === 'sent') query.assignedBy = session.user.name;

    const assignments = await db.collection('assignments')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    // Compute live progress for each assignment
    const enriched = await Promise.all(
      assignments.map(async (a) => {
        const ids = (a.testCaseIds || []).map((id) => {
          try { return new ObjectId(id); } catch { return null; }
        }).filter(Boolean);

        let completedCount = 0;
        if (ids.length > 0) {
          completedCount = await db.collection('testCases').countDocuments({
            _id: { $in: ids },
            status: { $in: ['Pass', 'Fail'] },
          });
        }

        return { ...a, _id: a._id.toString(), completedCount };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });

    const body = await request.json();
    const { title, type, moduleIds, testCaseIds: rawIds, assignedTo, priority, dueDate, notes } = body;

    if (!assignedTo) return NextResponse.json({ error: 'assignedTo is required' }, { status: 400 });

    const db = await getDb();
    const teamId = session.user.teamId;

    let resolvedIds = [];
    let resolvedModuleIds = [];

    if (type === 'module' && moduleIds?.length) {
      resolvedModuleIds = moduleIds;
      const cases = await db.collection('testCases')
        .find({ teamId, moduleId: { $in: moduleIds } }, { projection: { _id: 1 } })
        .toArray();
      resolvedIds = cases.map((c) => c._id.toString());
    } else if (type === 'selection' && rawIds?.length) {
      resolvedIds = rawIds;
    } else {
      return NextResponse.json({ error: 'Provide moduleIds (module type) or testCaseIds (selection type)' }, { status: 400 });
    }

    if (resolvedIds.length === 0) {
      return NextResponse.json({ error: 'No test cases found for this assignment' }, { status: 400 });
    }

    const now = new Date();
    const doc = {
      teamId,
      title: title?.trim() || (type === 'module' ? 'Module Assignment' : `${resolvedIds.length} Test Cases`),
      type,
      moduleIds: resolvedModuleIds,
      testCaseIds: resolvedIds,
      testCaseCount: resolvedIds.length,
      assignedTo,
      assignedBy: session.user.name,
      priority: priority || 'Medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes || '',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection('assignments').insertOne(doc);
    const assignmentId = result.insertedId.toString();

    // Stamp each test case with the assignee and assignment reference
    const oids = resolvedIds.map((id) => new ObjectId(id));
    await db.collection('testCases').updateMany(
      { _id: { $in: oids } },
      { $set: { assignedTo, assignmentId, updatedAt: now } }
    );

    return NextResponse.json({ ok: true, id: assignmentId, testCaseCount: resolvedIds.length });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
