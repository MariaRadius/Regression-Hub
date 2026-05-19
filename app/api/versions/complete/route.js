import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { version } = await request.json();
    if (!version) return NextResponse.json({ error: 'version required' }, { status: 400 });

    const db = await getDb();
    const teamId = session.user.teamId;
    const now = new Date();

    // Snapshot all test cases currently tagged with this version
    const testCases = await db.collection('testCases')
      .find(
        { teamId, softwareVersionTested: version },
        { projection: { _id: 1, status: 1, testedBy: 1, testedOn: 1, actualResult: 1, defectsImprovements: 1, testRunId: 1, history: 1 } }
      )
      .toArray();

    if (testCases.length) {
      const bulkOps = testCases.map((tc) => {
        const snapshot = {
          version,
          status: tc.status || '',
          testedBy: tc.testedBy || '',
          testedOn: tc.testedOn || '',
          actualResult: tc.actualResult || '',
          defectsImprovements: tc.defectsImprovements || '',
          testRunId: tc.testRunId || '',
          snapshotAt: now,
        };

        // Replace any existing entry for this version to avoid duplicates, then append fresh snapshot
        const newHistory = [...(tc.history || []).filter((h) => h.version !== version), snapshot];

        return {
          updateOne: {
            filter: { _id: tc._id, teamId },
            update: { $set: { history: newHistory } },
          },
        };
      });

      await db.collection('testCases').bulkWrite(bulkOps, { ordered: false });
    }

    // Record in teamSettings so the versions API marks this version as completed
    await db.collection('teamSettings').updateOne(
      { teamId },
      { $addToSet: { completedVersions: version } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, snapshotted: testCases.length });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
