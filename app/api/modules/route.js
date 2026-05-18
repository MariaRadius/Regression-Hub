import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getDb();
    const teamId = session.user.teamId;

    const modules = await db.collection('modules').find({ teamId }).toArray();
    const applications = await db.collection('applications').find({ teamId }).toArray();
    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));

    const enriched = modules
      .map((m) => ({
        ...m,
        _id: m._id.toString(),
        applicationName: appMap[m.applicationId] || 'Unknown',
      }))
      .sort((a, b) => {
        const appCmp = a.applicationName.localeCompare(b.applicationName);
        return appCmp !== 0 ? appCmp : a.name.localeCompare(b.name);
      });

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
