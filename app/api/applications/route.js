import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const applications = await db.collection('applications').find({}).sort({ name: 1 }).toArray();
    return NextResponse.json(applications.map((a) => ({ ...a, _id: a._id.toString() })));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
