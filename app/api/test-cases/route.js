import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

function normalizedStatus(status) {
  return status === 'Pass' || status === 'Fail' ? status : 'Pending';
}

export async function GET(request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(request.url);

    const filterApp = searchParams.get('applicationId') || '';
    const filterMod = searchParams.get('moduleId') || '';
    const filterStatus = searchParams.get('status') || '';
    const filterTestedBy = searchParams.get('testedBy') || '';
    const filterVersion = searchParams.get('version') || '';

    const query = {};
    if (filterApp) query.applicationId = filterApp;
    if (filterMod) query.moduleId = filterMod;
    if (filterTestedBy) query.testedBy = filterTestedBy;
    if (filterVersion) query.softwareVersionTested = { $regex: filterVersion, $options: 'i' };

    const testCases = await db.collection('testCases').find(query).sort({ createdAt: 1 }).toArray();
    const applications = await db.collection('applications').find({}).toArray();
    const modules = await db.collection('modules').find({}).toArray();

    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
    const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

    let enriched = testCases.map((tc) => ({
      ...tc,
      _id: tc._id.toString(),
      applicationName: appMap[tc.applicationId] || 'Unknown',
      moduleName: modMap[tc.moduleId] || 'Unknown',
    }));

    // Status filter (after enrichment since it uses normalizedStatus)
    if (filterStatus) {
      enriched = enriched.filter((tc) => normalizedStatus(tc.status) === filterStatus);
    }

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('GET test cases error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const db = await getDb();
    await Promise.all([
      db.collection('testCases').deleteMany({}),
      db.collection('testRuns').deleteMany({}),
      db.collection('modules').deleteMany({}),
      db.collection('applications').deleteMany({}),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
