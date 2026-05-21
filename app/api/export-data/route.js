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
    const applicationId    = searchParams.get('applicationId') || '';
    const testRunId        = searchParams.get('testRunId') || '';
    const softwareVersion  = searchParams.get('softwareVersion') || '';

    const liveQuery = { teamId };
    if (applicationId) liveQuery.applicationId = applicationId;
    if (testRunId)     liveQuery.testRunId = testRunId;
    if (softwareVersion) liveQuery.softwareVersionTested = softwareVersion;

    const [liveTestCases, applications, modules] = await Promise.all([
      db.collection('testCases').find(liveQuery).sort({ createdAt: 1 }).toArray(),
      db.collection('applications').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
      db.collection('modules').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
    ]);

    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
    const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

    let testCases = liveTestCases;

    // If exporting a specific version and live results are empty, check history snapshots
    if (softwareVersion && liveTestCases.length === 0) {
      const histQuery = { teamId, 'history.version': softwareVersion };
      if (applicationId) histQuery.applicationId = applicationId;

      const historicalDocs = await db.collection('testCases')
        .find(histQuery)
        .sort({ createdAt: 1 })
        .toArray();

      // Reconstruct rows: base fields + matching history snapshot fields
      testCases = historicalDocs.map((tc) => {
        const snap = (tc.history || []).find((h) => h.version === softwareVersion) || {};
        return {
          ...tc,
          status: snap.status ?? tc.status,
          testedBy: snap.testedBy ?? tc.testedBy,
          testedOn: snap.testedOn ?? tc.testedOn,
          actualResult: snap.actualResult ?? tc.actualResult,
          defectsImprovements: snap.defectsImprovements ?? tc.defectsImprovements,
          softwareVersionTested: softwareVersion,
        };
      });
    }

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
