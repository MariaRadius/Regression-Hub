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

    // Fetch all test cases that have this version in their history
    const testCases = await db.collection('testCases')
      .find(
        { teamId, 'history.version': version },
        { projection: { _id: 1, softwareVersionTested: 1, status: 1, testedBy: 1, testedOn: 1, actualResult: 1, defectsImprovements: 1, testRunId: 1, history: 1 } }
      )
      .toArray();

    if (!testCases.length) {
      return NextResponse.json({ error: 'No test cases found for this version in history' }, { status: 404 });
    }

    const bulkOps = testCases.map((tc) => {
      // Find the specific history entry to restore from
      const histEntry = tc.history.find((h) => h.version === version);
      if (!histEntry) return null;

      // Build new history array: remove the entry being restored, save the current state
      const newHistory = tc.history.filter((h) => h.version !== version);

      // Only snapshot current state if there's something worth preserving
      const currentVer = tc.softwareVersionTested || '';
      if (currentVer || tc.status || tc.testedBy) {
        newHistory.push({
          version: currentVer,
          status: tc.status || '',
          testedBy: tc.testedBy || '',
          testedOn: tc.testedOn || '',
          actualResult: tc.actualResult || '',
          defectsImprovements: tc.defectsImprovements || '',
          testRunId: tc.testRunId || '',
          snapshotAt: now,
        });
      }

      return {
        updateOne: {
          filter: { _id: tc._id, teamId },
          update: {
            $set: {
              softwareVersionTested: version,
              status: histEntry.status || '',
              testedBy: histEntry.testedBy || '',
              testedOn: histEntry.testedOn || '',
              actualResult: histEntry.actualResult || '',
              defectsImprovements: histEntry.defectsImprovements || '',
              history: newHistory,
              updatedAt: now,
            },
          },
        },
      };
    }).filter(Boolean);

    if (!bulkOps.length) {
      return NextResponse.json({ error: 'Nothing to restore' }, { status: 400 });
    }

    const result = await db.collection('testCases').bulkWrite(bulkOps, { ordered: false });

    return NextResponse.json({ ok: true, restored: result.modifiedCount });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
