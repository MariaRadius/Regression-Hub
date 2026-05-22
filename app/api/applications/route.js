import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const db = await getDb();
    const applications = await db
      .collection('applications')
      .find({ teamId: session.user.teamId })
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json(
      applications.map((a) => ({ ...a, _id: a._id.toString() })),
      { headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
