import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const modules = await db.collection('modules').find({}).sort({ name: 1 }).toArray();
    const applications = await db.collection('applications').find({}).toArray();
    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
    return NextResponse.json(
      modules.map((m) => ({
        ...m,
        _id: m._id.toString(),
        applicationName: appMap[m.applicationId] || 'Unknown',
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
