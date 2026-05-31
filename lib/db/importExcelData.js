import { getTeamSettings } from '@/lib/db/settingsData';
import { ApiError } from '@/lib/errors';
import { ensureIndexes } from '@/lib/indexes';
import { parseWorkbookBuffer } from '@/utils/excelImport';

function resolveId(result) {
  const id =
    result._id ?? result.lastErrorObject?.upserted ?? result.value?._id;
  if (id == null)
    throw new Error('resolveId: could not extract _id from result');
  return id.toString();
}

function contentKey(teamId, appName, modName, testCaseId, testCase) {
  const id = testCaseId?.trim();
  if (id) return `${teamId}::${appName}::${modName}::id::${id}`;
  const text = (testCase || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 150);
  return `${teamId}::${appName}::${modName}::text::${text}`;
}

export async function importExcelWorkbook(
  db,
  teamId,
  { buffer, fileName, softwareVersion = '', testEnvironment = '' },
) {
  if (!buffer?.length) throw new ApiError(400, 'No file uploaded');

  await ensureIndexes();

  const { qaUsers } = await getTeamSettings(db, teamId);
  const rows = parseWorkbookBuffer(buffer, qaUsers);

  if (!rows.length) {
    throw new ApiError(400, 'No valid test case rows found in the workbook.');
  }

  const now = new Date();

  const uniqueAppNames = [
    ...new Set(rows.map((r) => r.applicationName || 'Default Application')),
  ];
  const appResults = await Promise.all(
    uniqueAppNames.map((name) =>
      db
        .collection('applications')
        .findOneAndUpdate(
          { name, teamId },
          { $setOnInsert: { name, teamId, createdAt: now } },
          { upsert: true, returnDocument: 'after' },
        ),
    ),
  );
  const appMap = Object.fromEntries(
    uniqueAppNames.map((name, i) => [name, resolveId(appResults[i])]),
  );

  const uniqueModKeys = [
    ...new Map(
      rows.map((r) => {
        const appName = r.applicationName || 'Default Application';
        const modName = r.moduleName || 'Unassigned';
        return [`${appName}::${modName}`, { appId: appMap[appName], modName }];
      }),
    ).values(),
  ];
  const modResults = await Promise.all(
    uniqueModKeys.map(({ appId, modName }) =>
      db.collection('modules').findOneAndUpdate(
        { applicationId: appId, name: modName, teamId },
        {
          $setOnInsert: {
            applicationId: appId,
            name: modName,
            teamId,
            createdAt: now,
          },
        },
        { upsert: true, returnDocument: 'after' },
      ),
    ),
  );
  const modMap = Object.fromEntries(
    uniqueModKeys.map(({ appId, modName }, i) => [
      `${appId}::${modName}`,
      resolveId(modResults[i]),
    ]),
  );

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
      contentKey: contentKey(
        teamId,
        appName,
        modName,
        row.testCaseId,
        row.testCase,
      ),
      sourceFileName: fileName,
      sourceSheetName: row.sourceSheetName,
      type: row.type,
      traceability: row.traceability,
      testCaseId: row.testCaseId,
      testCase: row.testCase,
      preconditions: row.preconditions,
      steps: row.steps,
      expectedResult: row.expectedResult,
      notes: row.notes || '',
      status: row.status || '',
      testedBy: row.testedBy || '',
      testedOn: row.testedOn || '',
      softwareVersionTested: row.softwareVersionTested || softwareVersion,
      testEnvironment,
      createdAt: now,
      updatedAt: now,
    };
  });

  const incomingKeys = docs.map((d) => d.contentKey);
  const existingDocs = await db
    .collection('testCases')
    .find(
      { teamId, contentKey: { $in: incomingKeys } },
      {
        projection: {
          _id: 1,
          contentKey: 1,
          softwareVersionTested: 1,
          status: 1,
          testedBy: 1,
          testedOn: 1,
          notes: 1,
          testRunId: 1,
        },
      },
    )
    .toArray();

  const existingByKey = new Map(existingDocs.map((d) => [d.contentKey, d]));

  const newCount = docs.filter((d) => !existingByKey.has(d.contentKey)).length;
  const updateCount = docs.length - newCount;

  const testRunResult = await db.collection('testRuns').insertOne({
    teamId,
    uploadedFileName: fileName,
    softwareVersion:
      softwareVersion ||
      rows.find((r) => r.softwareVersionTested)?.softwareVersionTested ||
      '',
    testEnvironment,
    createdAt: now,
    importedCount: newCount,
    updatedCount: updateCount,
    totalInFile: docs.length,
  });
  const testRunId = testRunResult.insertedId.toString();

  const toInsert = [];
  const bulkOps = [];

  for (const d of docs) {
    d.testRunId = testRunId;

    if (!existingByKey.has(d.contentKey)) {
      toInsert.push(d);
    } else {
      const existing = existingByKey.get(d.contentKey);
      const newVer = d.softwareVersionTested || '';
      const oldVer = existing.softwareVersionTested || '';
      const isNewCycle = newVer !== '' && newVer !== oldVer;

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

      const op = {
        updateOne: { filter: { _id: existing._id, teamId }, update: { $set } },
      };

      if (isNewCycle) {
        const hadActivity =
          existing.status || existing.testedBy || existing.notes;
        if (hadActivity) {
          op.updateOne.update.$push = {
            history: {
              version: oldVer,
              status: existing.status || '',
              testedBy: existing.testedBy || '',
              testedOn: existing.testedOn || '',
              notes: existing.notes || '',
              testRunId: existing.testRunId || '',
              snapshotAt: now,
            },
          };
        }
        Object.assign($set, {
          status: '',
          notes: '',
          testedBy: '',
          testedOn: '',
        });
      }

      bulkOps.push(op);
    }
  }

  await Promise.all([
    toInsert.length > 0
      ? db.collection('testCases').insertMany(toInsert, { ordered: false })
      : Promise.resolve(),
    bulkOps.length > 0
      ? db.collection('testCases').bulkWrite(bulkOps, { ordered: false })
      : Promise.resolve(),
  ]);

  return {
    imported: toInsert.length,
    updated: bulkOps.length,
    testRunId,
  };
}
