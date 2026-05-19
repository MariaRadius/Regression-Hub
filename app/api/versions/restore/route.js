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

    // Fetch every test case for this team so no case is left behind
    const allTestCases = await db.collection('testCases')
      .find(
        { teamId },
        { projection: { _id: 1, softwareVersionTested: 1, status: 1, testedBy: 1, testedOn: 1, actualResult: 1, defectsImprovements: 1, testRunId: 1, history: 1 } }
      )
      .toArray();

    if (!allTestCases.length) {
      return NextResponse.json({ error: 'No test cases found' }, { status: 404 });
    }

    // Which live versions will be displaced?
    const displacedVersions = [...new Set(
      allTestCases.map((tc) => tc.softwareVersionTested).filter((v) => v && v !== version)
    )];

    const bulkOps = allTestCases.map((tc) => {
      const currentVer = tc.softwareVersionTested || '';

      // Already on the target version — nothing to change
      if (currentVer === version) return null;

      // Find this version's snapshot in history (if any)
      const histEntry = (tc.history || []).find((h) => h.version === version);

      // Build new history: remove all entries for the target version, keep the rest
      const newHistory = (tc.history || []).filter((h) => h.version !== version);

      // Snapshot the current live state before overwriting
      if (currentVer && (tc.status || tc.testedBy || tc.actualResult)) {
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
              // Restore from snapshot if we have one; otherwise reset to Pending (no data)
              status: histEntry?.status ?? '',
              testedBy: histEntry?.testedBy ?? '',
              testedOn: histEntry?.testedOn ?? '',
              actualResult: histEntry?.actualResult ?? '',
              defectsImprovements: histEntry?.defectsImprovements ?? '',
              history: newHistory,
              updatedAt: now,
            },
          },
        },
      };
    }).filter(Boolean);

    let restoredCount = 0;
    if (bulkOps.length) {
      const result = await db.collection('testCases').bulkWrite(bulkOps, { ordered: false });
      restoredCount = result.modifiedCount;
    }

    // Swap version states in teamSettings:
    // restored version → active (remove from completedVersions, update softwareVersion)
    // displaced versions → completed (add to completedVersions)
    await db.collection('teamSettings').updateOne(
      { teamId },
      { $set: { softwareVersion: version }, $pull: { completedVersions: version } },
      { upsert: true }
    );
    for (const v of displacedVersions) {
      await db.collection('teamSettings').updateOne(
        { teamId },
        { $addToSet: { completedVersions: v } },
        { upsert: true }
      );
    }

    return NextResponse.json({ ok: true, restored: restoredCount });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
