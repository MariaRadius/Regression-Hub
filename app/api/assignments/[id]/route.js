import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const db = await getDb();
    const teamId = session.user.teamId;

    const assignment = await db.collection('assignments').findOne({
      _id: new ObjectId(id),
      teamId,
    });
    if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const update = { updatedAt: new Date() };
    if (body.title !== undefined)    update.title = body.title;
    if (body.notes !== undefined)    update.notes = body.notes;
    if (body.priority !== undefined) update.priority = body.priority;
    if (body.dueDate !== undefined)  update.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.status !== undefined)   update.status = body.status;

    await db.collection('assignments').updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({}, { status: 401 });

    const { id } = await params;
    const db = await getDb();
    const teamId = session.user.teamId;

    const assignment = await db.collection('assignments').findOne({
      _id: new ObjectId(id),
      teamId,
    });
    if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Remove stamps from test cases that belong to this assignment
    const oids = (assignment.testCaseIds || []).map((tcId) => {
      try { return new ObjectId(tcId); } catch { return null; }
    }).filter(Boolean);

    if (oids.length > 0) {
      await db.collection('testCases').updateMany(
        { _id: { $in: oids }, assignmentId: id },
        { $unset: { assignedTo: '', assignmentId: '' }, $set: { updatedAt: new Date() } }
      );
    }

    await db.collection('assignments').deleteOne({ _id: new ObjectId(id) });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
