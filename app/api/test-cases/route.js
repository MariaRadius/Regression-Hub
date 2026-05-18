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

    const filterApp      = searchParams.get('applicationId') || '';
    const filterMod      = searchParams.get('moduleId') || '';
    const filterStatus   = searchParams.get('status') || '';
    const filterTestedBy = searchParams.get('testedBy') || '';
    const filterVersion  = searchParams.get('version') || '';
    const page           = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit          = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    const query = { teamId };
    if (filterApp) query.applicationId = filterApp;
    if (filterMod) query.moduleId = filterMod;
    if (filterTestedBy === '__unassigned__') {
      query.$or = [{ testedBy: '' }, { testedBy: null }, { testedBy: { $exists: false } }];
    } else if (filterTestedBy) {
      query.testedBy = filterTestedBy;
    }
    if (filterVersion) query.softwareVersionTested = { $regex: filterVersion, $options: 'i' };
    // Status filter moved to DB — avoids loading all docs client-side
    if (filterStatus === 'Pass') query.status = 'Pass';
    else if (filterStatus === 'Fail') query.status = 'Fail';
    else if (filterStatus === 'Pending') query.status = { $nin: ['Pass', 'Fail'] };

    const skip = (page - 1) * limit;

    const [testCases, total, applications, modules] = await Promise.all([
      db.collection('testCases').find(query).sort({ createdAt: 1 }).skip(skip).limit(limit).toArray(),
      db.collection('testCases').countDocuments(query),
      db.collection('applications').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
      db.collection('modules').find({ teamId }, { projection: { _id: 1, name: 1 } }).toArray(),
    ]);

    const appMap = Object.fromEntries(applications.map((a) => [a._id.toString(), a.name]));
    const modMap = Object.fromEntries(modules.map((m) => [m._id.toString(), m.name]));

    const enriched = testCases.map((tc) => ({
      ...tc,
      _id: tc._id.toString(),
      applicationName: appMap[tc.applicationId] || 'Unknown',
      moduleName: modMap[tc.moduleId] || 'Unknown',
    }));

    return NextResponse.json({ data: enriched, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('GET test cases error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { applicationId, moduleId, applicationName, moduleName, ...fields } = body;

    if (!applicationId || !moduleId) {
      return NextResponse.json({ error: 'applicationId and moduleId required' }, { status: 400 });
    }

    const db = await getDb();
    const teamId = session.user.teamId;

    const doc = {
      teamId,
      applicationId,
      moduleId,
      testRunId: 'manual',
      uniqueKey: `${teamId}::${applicationName || applicationId}::${moduleName || moduleId}::${fields.testCaseId || Date.now()}`,
      sourceFileName: 'manual',
      sourceSheetName: '',
      type: fields.type || '',
      traceability: fields.traceability || '',
      testCaseId: fields.testCaseId || '',
      testCase: fields.testCase || '',
      preconditions: fields.preconditions || '',
      steps: fields.steps || '',
      expectedResult: fields.expectedResult || '',
      actualResult: fields.actualResult || '',
      status: fields.status || '',
      defectsImprovements: fields.defectsImprovements || '',
      testedBy: fields.testedBy || '',
      testedOn: fields.testedOn || '',
      softwareVersionTested: fields.softwareVersionTested || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection('testCases').insertOne(doc);
    return NextResponse.json({ ok: true, id: result.insertedId.toString() });
  } catch (error) {
    console.error('POST test case error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getDb();
    const teamId = session.user.teamId;

    await Promise.all([
      db.collection('testCases').deleteMany({ teamId }),
      db.collection('testRuns').deleteMany({ teamId }),
      db.collection('modules').deleteMany({ teamId }),
      db.collection('applications').deleteMany({ teamId }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
