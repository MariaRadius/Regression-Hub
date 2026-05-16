import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const testRuns = await db.collection('testRuns').find({}).sort({ createdAt: -1 }).toArray();
    return NextResponse.json(testRuns.map((r) => ({ ...r, _id: r._id.toString() })));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
