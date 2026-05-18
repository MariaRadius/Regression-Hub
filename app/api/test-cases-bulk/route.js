import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function PATCH(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { ids, fields } = await request.json();
    if (!ids?.length || !fields) {
      return NextResponse.json({ error: 'ids and fields required' }, { status: 400 });
    }

    const db = await getDb();
    const allowedFields = [
      'actualResult', 'status', 'defectsImprovements',
      'testedBy', 'testedOn', 'softwareVersionTested',
    ];

    const update = {};
    for (const field of allowedFields) {
      if (field in fields && fields[field] !== '') update[field] = fields[field];
    }
    update.updatedAt = new Date();

    await db.collection('testCases').updateMany(
      { _id: { $in: ids.map((id) => new ObjectId(id)) }, teamId: session.user.teamId },
      { $set: update }
    );

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (error) {
    console.error('Bulk PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
