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

function contentKey(teamId, appName, modName, testCaseId, testCase) {
  const id = testCaseId?.trim();
  if (id) return `${teamId}::${appName}::${modName}::id::${id}`;
  const text = (testCase || '').toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 150);
  return `${teamId}::${appName}::${modName}::text::${text}`;
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

    // ── Step 1: upsert applications ──
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

    // ── Step 2: upsert modules ──
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

    // ── Step 3: build incoming docs with fingerprints ──
    const docs = rows.map((row) => {
      const appName = row.applicationName || 'Default Application';
      const modName = row.moduleName || 'Unassigned';
      const appId = appMap[appName];
      const modId = modMap[`${appId}::${modName}`];
      return {
        teamId,
        testRunId: null,
        applicationId: appId,
        moduleId: modId,
        contentKey: contentKey(teamId, appName, modName, row.testCaseId, row.testCase),
        sourceFileName: file.name,
        sourceSheetName: row.sourceSheetName,
        type: row.type,
        traceability: row.traceability,
        testCaseId: row.testCaseId,
        testCase: row.testCase,
        preconditions: row.preconditions,
        steps: row.steps,
        expectedResult: row.expectedResult,
        actualResult: row.actualResult || '',
        status: row.status || '',
        defectsImprovements: row.defectsImprovements || '',
        testedBy: row.testedBy || '',
        testedOn: row.testedOn || '',
        softwareVersionTested: row.softwareVersionTested || softwareVersion,
        testEnvironment,
        createdAt: now,
        updatedAt: now,
      };
    });

    // ── Step 4: fetch existing docs for self-healing (need full state to snapshot) ──
    const incomingKeys = docs.map((d) => d.contentKey);
    const existingDocs = await db.collection('testCases')
      .find(
        { teamId, contentKey: { $in: incomingKeys } },
        { projection: { _id: 1, contentKey: 1, softwareVersionTested: 1, status: 1, testedBy: 1, testedOn: 1, actualResult: 1, defectsImprovements: 1, testRunId: 1 } }
      )
      .toArray();

    const existingByKey = new Map(existingDocs.map((d) => [d.contentKey, d]));

    // ── Step 5: create test run ──
    const newCount = docs.filter((d) => !existingByKey.has(d.contentKey)).length;
    const updateCount = docs.length - newCount;

    const testRunResult = await db.collection('testRuns').insertOne({
      teamId,
      uploadedFileName: file.name,
      softwareVersion: softwareVersion || rows.find((r) => r.softwareVersionTested)?.softwareVersionTested || '',
      testEnvironment,
      createdAt: now,
      importedCount: newCount,
      updatedCount: updateCount,
      totalInFile: docs.length,
    });
    const testRunId = testRunResult.insertedId.toString();

    // ── Step 6: split into inserts vs self-healing updates ──
    const toInsert = [];
    const bulkOps = [];

    for (const d of docs) {
      d.testRunId = testRunId;

      if (!existingByKey.has(d.contentKey)) {
        // Brand-new test case
        toInsert.push(d);
      } else {
        const existing = existingByKey.get(d.contentKey);
        const newVer = d.softwareVersionTested || '';
        const oldVer = existing.softwareVersionTested || '';
        const isNewCycle = newVer !== '' && newVer !== oldVer;

        // Fields to always update (content from new file)
        const $set = {
          testCase: d.testCase,
          steps: d.steps,
          expectedResult: d.expectedResult,
          preconditions: d.preconditions,
          type: d.type,
          traceability: d.traceability,
          testCaseId: d.testCaseId,
          sourceFileName: d.sourceFileName,
          softwareVersionTested: newVer || oldVer,
          testEnvironment: d.testEnvironment,
          testRunId,
          updatedAt: now,
        };

        const op = { updateOne: { filter: { _id: existing._id, teamId }, update: { $set } } };

        if (isNewCycle) {
          // New version cycle → snapshot the current state, then reset results to Pending
          const hadActivity = existing.status || existing.testedBy || existing.actualResult;
          if (hadActivity) {
            op.updateOne.update.$push = {
              history: {
                version: oldVer,
                status: existing.status || '',
                testedBy: existing.testedBy || '',
                testedOn: existing.testedOn || '',
                actualResult: existing.actualResult || '',
                defectsImprovements: existing.defectsImprovements || '',
                testRunId: existing.testRunId || '',
                snapshotAt: now,
              },
            };
          }
          // Reset test results for fresh cycle
          Object.assign($set, {
            status: '',
            actualResult: '',
            testedBy: '',
            testedOn: '',
            defectsImprovements: '',
          });
        }

        bulkOps.push(op);
      }
    }

    // ── Step 7: execute in parallel ──
    await Promise.all([
      toInsert.length > 0 ? db.collection('testCases').insertMany(toInsert, { ordered: false }) : Promise.resolve(),
      bulkOps.length > 0 ? db.collection('testCases').bulkWrite(bulkOps, { ordered: false }) : Promise.resolve(),
    ]);

    return NextResponse.json({
      imported: toInsert.length,
      updated: bulkOps.length,
      testRunId,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 });
  }
}
