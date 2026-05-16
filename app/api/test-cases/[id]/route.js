import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();

    const allowedFields = [
      'actualResult', 'status', 'defectsImprovements',
      'testedBy', 'testedOn', 'softwareVersionTested',
    ];

    const update = {};
    for (const field of allowedFields) {
      if (field in body) update[field] = body[field];
    }
    update.updatedAt = new Date();

    await db.collection('testCases').updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH test case error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
