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

    const passExpr = { $cond: [{ $eq: ['$status', 'Pass'] }, 1, 0] };
    const failExpr = { $cond: [{ $eq: ['$status', 'Fail'] }, 1, 0] };

    // Current cycle: live softwareVersionTested field
    const currentPipeline = [
      { $match: { teamId, softwareVersionTested: { $exists: true, $ne: '' } } },
      { $group: {
        _id: '$softwareVersionTested',
        total: { $sum: 1 },
        passed: { $sum: passExpr },
        failed: { $sum: failExpr },
        lastUpdated: { $max: '$updatedAt' },
      }},
    ];

    // Historical cycles: from the history[] snapshots saved during self-healing imports
    const historyPipeline = [
      { $match: { teamId, 'history.0': { $exists: true } } },
      { $unwind: '$history' },
      { $match: { 'history.version': { $exists: true, $ne: '' } } },
      { $group: {
        _id: '$history.version',
        total: { $sum: 1 },
        passed: { $sum: { $cond: [{ $eq: ['$history.status', 'Pass'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$history.status', 'Fail'] }, 1, 0] } },
        lastUpdated: { $max: '$history.snapshotAt' },
      }},
    ];

    const [currentRows, historyRows, settings] = await Promise.all([
      db.collection('testCases').aggregate(currentPipeline).toArray(),
      db.collection('testCases').aggregate(historyPipeline).toArray(),
      db.collection('teamSettings').findOne({ teamId }, { projection: { completedVersions: 1 } }),
    ]);

    const completedSet = new Set(settings?.completedVersions || []);

    // Merge: current version takes precedence if it appears in both
    const versionMap = new Map();

    // Historical first (lower priority)
    for (const r of historyRows) {
      versionMap.set(r._id, { ...r, isCurrent: false });
    }
    // Current overwrites historical for same version, but honour manually-completed flag
    for (const r of currentRows) {
      versionMap.set(r._id, { ...r, isCurrent: !completedSet.has(r._id) });
    }

    const versions = [...versionMap.values()]
      .map((r) => ({
        version: r._id,
        total: r.total,
        passed: r.passed,
        failed: r.failed,
        pending: r.total - r.passed - r.failed,
        passRate: r.total ? Math.round((r.passed / r.total) * 100) : 0,
        lastUpdated: r.lastUpdated,
        isCurrent: r.isCurrent,
      }))
      .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

    return NextResponse.json(versions, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.user.role !== 'admin') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version');
    const isCurrent = searchParams.get('isCurrent') === 'true';
    if (!version) return NextResponse.json({ error: 'version param required' }, { status: 400 });

    const db = await getDb();
    const teamId = session.user.teamId;

    if (isCurrent) {
      // Delete all test cases belonging to this active version
      const result = await db.collection('testCases').deleteMany({ teamId, softwareVersionTested: version });
      return NextResponse.json({ ok: true, deleted: result.deletedCount });
    } else {
      // Remove only the history snapshot entries for this version across all test cases
      const result = await db.collection('testCases').updateMany(
        { teamId, 'history.version': version },
        { $pull: { history: { version } } }
      );
      return NextResponse.json({ ok: true, deleted: result.modifiedCount });
    }
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
