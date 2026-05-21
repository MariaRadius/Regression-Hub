import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function PATCH(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const db = await getDb();

    const allowedFields = [
      'actualResult', 'status', 'defectsImprovements',
      'testedBy', 'testedOn', 'softwareVersionTested',
      'priority', 'jiraStory',
      'testCaseId', 'type', 'traceability', 'testCase',
      'preconditions', 'steps', 'expectedResult',
      'applicationId', 'moduleId',
    ];

    const update = {};
    for (const field of allowedFields) {
      if (field in body) update[field] = body[field];
    }
    update.updatedAt = new Date();

    // teamId in filter prevents cross-team edits
    await db.collection('testCases').updateOne(
      { _id: new ObjectId(id), teamId: session.user.teamId },
      { $set: update }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH test case error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
