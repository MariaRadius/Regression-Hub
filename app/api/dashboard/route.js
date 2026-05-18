import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';

function normalizedStatus(status) {
  return status === 'Pass' || status === 'Fail' ? status : 'Pending';
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getDb();
    const teamId = session.user.teamId;
    const { searchParams } = new URL(request.url);
    const applicationId = searchParams.get('applicationId') || '';

    const query = applicationId ? { teamId, applicationId } : { teamId };
    const testCases = await db.collection('testCases').find(query).toArray();
    const applications = await db.collection('applications').find({ teamId }).toArray();
    const modules = await db.collection('modules').find({ teamId }).toArray();

    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
    const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

    const enriched = testCases.map((tc) => ({
      ...tc,
      _id: tc._id.toString(),
      applicationName: appMap[tc.applicationId] || 'Unknown',
      moduleName: modMap[tc.moduleId] || 'Unknown',
      status: normalizedStatus(tc.status),
    }));

    const total = enriched.length;
    const passed = enriched.filter((t) => t.status === 'Pass').length;
    const failed = enriched.filter((t) => t.status === 'Fail').length;
    const pending = total - passed - failed;

    // Module breakdown
    const moduleGroups = {};
    enriched.forEach((tc) => {
      const key = tc.moduleName;
      if (!moduleGroups[key]) moduleGroups[key] = { total: 0, passed: 0, failed: 0, pending: 0 };
      moduleGroups[key].total++;
      if (tc.status === 'Pass') moduleGroups[key].passed++;
      else if (tc.status === 'Fail') moduleGroups[key].failed++;
      else moduleGroups[key].pending++;
    });

    // Application breakdown
    const appGroups = {};
    enriched.forEach((tc) => {
      const key = tc.applicationName;
      if (!appGroups[key]) appGroups[key] = { total: 0, passed: 0, failed: 0, pending: 0 };
      appGroups[key].total++;
      if (tc.status === 'Pass') appGroups[key].passed++;
      else if (tc.status === 'Fail') appGroups[key].failed++;
      else appGroups[key].pending++;
    });

    // Tester breakdown
    const testerGroups = {};
    enriched.forEach((tc) => {
      const key = tc.testedBy || 'Unassigned';
      if (!testerGroups[key]) testerGroups[key] = { total: 0, passed: 0, failed: 0, pending: 0 };
      testerGroups[key].total++;
      if (tc.status === 'Pass') testerGroups[key].passed++;
      else if (tc.status === 'Fail') testerGroups[key].failed++;
      else testerGroups[key].pending++;
    });

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
      appGroups,
      testerGroups,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
