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

    const match = applicationId ? { teamId, applicationId } : { teamId };

    // Single aggregation pass — no document loading into Node.js memory
    const passExpr = { $cond: [{ $eq: ['$status', 'Pass'] }, 1, 0] };
    const failExpr = { $cond: [{ $eq: ['$status', 'Fail'] }, 1, 0] };

    const [[agg], applications, modules] = await Promise.all([
      db.collection('testCases').aggregate([
        { $match: match },
        {
          $facet: {
            summary: [
              { $group: { _id: null, total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } },
            ],
            byModule: [
              { $group: { _id: '$moduleId', total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } },
            ],
            byApp: [
              { $group: { _id: '$applicationId', total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } },
            ],
            byTester: [
              { $group: { _id: { $ifNull: ['$testedBy', ''] }, total: { $sum: 1 }, passed: { $sum: passExpr }, failed: { $sum: failExpr } } },
            ],
          },
        },
      ]).toArray(),
      db.collection('applications').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
      db.collection('modules').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
    ]);

    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
    const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

    const s = agg.summary[0] ?? { total: 0, passed: 0, failed: 0 };
    const { total, passed, failed } = s;
    const pending = total - passed - failed;

    const moduleGroups = Object.fromEntries(
      agg.byModule.map(({ _id, total: t, passed: p, failed: f }) => [
        modMap[_id] || 'Unknown',
        { total: t, passed: p, failed: f, pending: t - p - f },
      ])
    );

    // Also keyed by module ID for the Modules page (avoids name collisions)
    const moduleGroupsById = Object.fromEntries(
      agg.byModule.map(({ _id, total: t, passed: p, failed: f }) => [
        _id,
        { total: t, passed: p, failed: f, pending: t - p - f },
      ])
    );

    const appGroups = Object.fromEntries(
      agg.byApp.map(({ _id, total: t, passed: p, failed: f }) => [
        appMap[_id] || 'Unknown',
        { total: t, passed: p, failed: f, pending: t - p - f },
      ])
    );

    const testerGroups = Object.fromEntries(
      agg.byTester.map(({ _id, total: t, passed: p, failed: f }) => [
        _id || 'Unassigned',
        { total: t, passed: p, failed: f, pending: t - p - f },
      ])
    );

    return NextResponse.json({
      summary: {
        total,
        passed,
        failed,
        pending,
        passPercent: total ? Math.round((passed / total) * 100) : 0,
        failPercent: total ? Math.round((failed / total) * 100) : 0,
      },
      moduleGroups,
      moduleGroupsById,
      appGroups,
      testerGroups,
    }, { headers: { 'Cache-Control': 'private, max-age=10, stale-while-revalidate=30' } });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
