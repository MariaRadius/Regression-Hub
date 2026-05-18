import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDb } from '@/lib/mongodb';
import { ensureIndexes } from '@/lib/indexes';
import { parseWorkbookBuffer } from '@/utils/excelImport';

const TEAM_QA_USERS = {
  radius: ['Ammad', 'Maria', 'Sohail'],
  cb: ['Ali', 'Nimra', 'Aimen', 'Hamza'],
};

function resolveId(result) {
  return (result._id ?? result.lastErrorObject?.upserted ?? result.value?._id).toString();
}

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const teamId = session.user.teamId;

    await ensureIndexes();
    const formData = await request.formData();
    const file = formData.get('file');
    const softwareVersion = formData.get('softwareVersion') || '';
    const testEnvironment = formData.get('testEnvironment') || '';

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const qaUsers = TEAM_QA_USERS[teamId] || [];
    const rows = parseWorkbookBuffer(buffer, qaUsers);

    if (!rows.length) {
      return NextResponse.json({ error: 'No valid test case rows found in the workbook.' }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date();

    // ── Step 1: upsert all unique applications in parallel ──
    const uniqueAppNames = [...new Set(rows.map((r) => r.applicationName || 'Default Application'))];
    const appResults = await Promise.all(
      uniqueAppNames.map((name) =>
        db.collection('applications').findOneAndUpdate(
          { name, teamId },
          { $setOnInsert: { name, teamId, createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        )
      )
    );
    const appMap = Object.fromEntries(uniqueAppNames.map((name, i) => [name, resolveId(appResults[i])]));

    // ── Step 2: upsert all unique modules in parallel ──
    const uniqueModKeys = [
      ...new Map(
        rows.map((r) => {
          const appName = r.applicationName || 'Default Application';
          const modName = r.moduleName || 'Unassigned';
          return [`${appName}::${modName}`, { appId: appMap[appName], modName }];
        })
      ).values(),
    ];
    const modResults = await Promise.all(
      uniqueModKeys.map(({ appId, modName }) =>
        db.collection('modules').findOneAndUpdate(
          { applicationId: appId, name: modName, teamId },
          { $setOnInsert: { applicationId: appId, name: modName, teamId, createdAt: now } },
          { upsert: true, returnDocument: 'after' }
        )
      )
    );
    const modMap = Object.fromEntries(
      uniqueModKeys.map(({ appId, modName }, i) => [`${appId}::${modName}`, resolveId(modResults[i])])
    );

    // ── Step 3: create test run ──
    const testRunResult = await db.collection('testRuns').insertOne({
      teamId,
      uploadedFileName: file.name,
      softwareVersion: softwareVersion || rows.find((r) => r.softwareVersionTested)?.softwareVersionTested || '',
      testEnvironment,
      createdAt: now,
      importedCount: rows.length,
    });
    const testRunId = testRunResult.insertedId.toString();

    // ── Step 4: bulk insert all test cases in one shot ──
    const docs = rows.map((row) => {
      const appName = row.applicationName || 'Default Application';
      const modName = row.moduleName || 'Unassigned';
      const appId = appMap[appName];
      const modId = modMap[`${appId}::${modName}`];
      return {
        teamId,
        testRunId,
        applicationId: appId,
        moduleId: modId,
        sourceFileName: file.name,
        sourceSheetName: row.sourceSheetName,
        type: row.type,
        traceability: row.traceability,
        testCaseId: row.testCaseId,
        testCase: row.testCase,
        preconditions: row.preconditions,
        steps: row.steps,
        expectedResult: row.expectedResult,
        actualResult: row.actualResult,
        status: row.status,
        defectsImprovements: row.defectsImprovements,
        testedBy: row.testedBy,
        testedOn: row.testedOn,
        softwareVersionTested: row.softwareVersionTested || softwareVersion,
        testEnvironment,
        createdAt: now,
        updatedAt: now,
      };
    });

    await db.collection('testCases').insertMany(docs, { ordered: false });

    return NextResponse.json({ imported: docs.length, skipped: 0, testRunId });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
  }
}
