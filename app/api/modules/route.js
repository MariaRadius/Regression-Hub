import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';

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

    return NextResponse.json(enriched, {
      headers: { 'Cache-Control': 'private, max-age=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name, applicationId } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
    if (!applicationId) return NextResponse.json({ error: 'applicationId required' }, { status: 400 });

    const db = await getDb();
    const teamId = session.user.teamId;

    // Verify app belongs to team
    const app = await db.collection('applications').findOne({ _id: new ObjectId(applicationId), teamId });
    if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 });

    const doc = { name: name.trim(), applicationId, teamId, createdAt: new Date() };
    const result = await db.collection('modules').insertOne(doc);

    return NextResponse.json({
      _id: result.insertedId.toString(),
      name: doc.name,
      applicationId,
      applicationName: app.name,
      teamId,
    }, { status: 201 });
  } catch (error) {
    if (error.code === 11000) return NextResponse.json({ error: 'Module already exists' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
