import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getDb();
    const testRuns = await db
      .collection('testRuns')
      .find({ teamId: session.user.teamId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(testRuns.map((r) => ({ ...r, _id: r._id.toString() })));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
