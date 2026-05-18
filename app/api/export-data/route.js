import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getDb();
    const teamId = session.user.teamId;
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('applicationId') || '';

    const query = applicationId ? { teamId, applicationId } : { teamId };
    const testCases = await db.collection('testCases').find(query).sort({ createdAt: 1 }).toArray();
    const applications = await db.collection('applications').find({ teamId }).toArray();
    const modules = await db.collection('modules').find({ teamId }).toArray();

    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
    const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

    const enriched = testCases.map((tc) => ({
      ...tc,
      _id: tc._id.toString(),
      applicationName: appMap[tc.applicationId] || 'Unknown',
      moduleName: modMap[tc.moduleId] || 'Unknown',
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
