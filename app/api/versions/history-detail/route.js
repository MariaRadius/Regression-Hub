import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const version = searchParams.get('version');
    if (!version) return NextResponse.json({ error: 'version required' }, { status: 400 });

    const db = await getDb();
    const teamId = session.user.teamId;

    const [modules, [agg]] = await Promise.all([
      db.collection('modules').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),

      // Single pass with $facet: filter to history entries for this version, then branch
      db.collection('testCases').aggregate([
        { $match: { teamId, 'history.version': version } },
        { $project: {
          moduleId: 1,
          h: { $filter: { input: '$history', as: 'h', cond: { $eq: ['$$h.version', version] } } },
        }},
        { $unwind: '$h' },
        { $facet: {
          summary: [
            { $group: {
              _id: null,
              total:  { $sum: 1 },
              passed: { $sum: { $cond: [{ $eq: ['$h.status', 'Pass'] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ['$h.status', 'Fail'] }, 1, 0] } },
            }},
          ],
          byModule: [
            { $group: {
              _id: '$moduleId',
              total:  { $sum: 1 },
              passed: { $sum: { $cond: [{ $eq: ['$h.status', 'Pass'] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ['$h.status', 'Fail'] }, 1, 0] } },
            }},
          ],
          byTester: [
            { $group: {
              _id: { $ifNull: ['$h.testedBy', ''] },
              total:  { $sum: 1 },
              passed: { $sum: { $cond: [{ $eq: ['$h.status', 'Pass'] }, 1, 0] } },
              failed: { $sum: { $cond: [{ $eq: ['$h.status', 'Fail'] }, 1, 0] } },
            }},
          ],
        }},
      ]).toArray(),
    ]);

    const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

    const s = agg?.summary[0] ?? { total: 0, passed: 0, failed: 0 };

    return NextResponse.json({
      version,
      summary: {
        total: s.total,
        passed: s.passed,
        failed: s.failed,
        pending: s.total - s.passed - s.failed,
        passRate: s.total ? Math.round((s.passed / s.total) * 100) : 0,
      },
      byModule: (agg?.byModule ?? [])
        .map((r) => ({
          module: modMap[r._id] || 'Unknown',
          total: r.total,
          passed: r.passed,
          failed: r.failed,
          pending: r.total - r.passed - r.failed,
          passRate: r.total ? Math.round((r.passed / r.total) * 100) : 0,
        }))
        .sort((a, b) => a.module.localeCompare(b.module)),
      byTester: (agg?.byTester ?? [])
        .map((r) => ({
          tester: r._id || 'Unassigned',
          total: r.total,
          passed: r.passed,
          failed: r.failed,
          pending: r.total - r.passed - r.failed,
        }))
        .sort((a, b) => b.total - a.total),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
