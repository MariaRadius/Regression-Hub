import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { ensureIndexes } from '@/lib/indexes';
import { parseWorkbookBuffer } from '@/utils/excelImport';

function makeUniqueKey(applicationName, moduleName, testCaseId) {
  return [applicationName, moduleName, testCaseId]
    .map((v) => String(v || '').toLowerCase().trim())
    .join('::');
}

async function ensureApplication(db, name) {
  const cleanName = name || 'Default Application';
  const result = await db.collection('applications').findOneAndUpdate(
    { name: cleanName },
    { $setOnInsert: { name: cleanName, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
  return result;
}

async function ensureModule(db, applicationId, name) {
  const cleanName = name || 'Unassigned';
  const result = await db.collection('modules').findOneAndUpdate(
    { applicationId: applicationId.toString(), name: cleanName },
    { $setOnInsert: { applicationId: applicationId.toString(), name: cleanName, createdAt: new Date() } },
    { upsert: true, returnDocument: 'after' }
  );
  return result;
}

export async function POST(request) {
  try {
    await ensureIndexes();
    const formData = await request.formData();
    const file = formData.get('file');
    const softwareVersion = formData.get('softwareVersion') || '';
    const testEnvironment = formData.get('testEnvironment') || 'QA';

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseWorkbookBuffer(buffer);

    if (!rows.length) {
      return NextResponse.json({ error: 'No valid test case rows found in the workbook.' }, { status: 400 });
    }

    const db = await getDb();

    // Get existing unique keys to deduplicate
    const existing = await db.collection('testCases').distinct('uniqueKey');
    const existingSet = new Set(existing);

    const newRows = [];
    const fileKeys = new Set();
    let duplicateCount = 0;

    for (const row of rows) {
      const uniqueKey = makeUniqueKey(row.applicationName, row.moduleName, row.testCaseId);
      if (existingSet.has(uniqueKey) || fileKeys.has(uniqueKey)) {
        duplicateCount++;
        continue;
      }
      fileKeys.add(uniqueKey);
      newRows.push({ ...row, uniqueKey });
    }

    if (!newRows.length) {
      return NextResponse.json({ imported: 0, skipped: duplicateCount, testRunId: null });
    }

    // Create test run
    const testRunResult = await db.collection('testRuns').insertOne({
      uploadedFileName: file.name,
      softwareVersion: softwareVersion || rows.find((r) => r.softwareVersionTested)?.softwareVersionTested || '',
      testEnvironment,
      createdAt: new Date(),
      importedCount: newRows.length,
      skippedDuplicateCount: duplicateCount,
    });
    const testRunId = testRunResult.insertedId.toString();

    // Insert test cases
    let imported = 0;
    for (const row of newRows) {
      const application = await ensureApplication(db, row.applicationName);
      const appId = (application._id || application.lastErrorObject?.upserted || application.value?._id).toString();
      const module = await ensureModule(db, appId, row.moduleName);
      const modId = (module._id || module.lastErrorObject?.upserted || module.value?._id).toString();

      await db.collection('testCases').insertOne({
        testRunId,
        applicationId: appId,
        moduleId: modId,
        uniqueKey: row.uniqueKey,
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      imported++;
    }

    return NextResponse.json({ imported, skipped: duplicateCount, testRunId });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
  }
}
