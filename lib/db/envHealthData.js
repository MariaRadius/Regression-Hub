import { ObjectId } from 'mongodb';
import { JOB_STATUS, STATUS } from '@/lib/constants';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

const COLLECTION = 'envHealthJobs';

export async function createEnvHealthJob(db, teamId, createdBy) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const now = new Date();
  const { insertedId } = await db.collection(COLLECTION).insertOne({
    teamId,
    status: JOB_STATUS.QUEUED,
    result: null,
    error: null,
    createdBy: createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return insertedId.toString();
}

export async function setJobProcessing(db, jobId) {
  if (!ObjectId.isValid(jobId)) throw new ApiError(400, 'invalid jobId');
  await db
    .collection(COLLECTION)
    .updateOne(
      { _id: new ObjectId(jobId) },
      { $set: { status: JOB_STATUS.PROCESSING, updatedAt: new Date() } },
    );
}

export async function setJobCompleted(db, jobId, result) {
  if (!ObjectId.isValid(jobId)) throw new ApiError(400, 'invalid jobId');
  await db
    .collection(COLLECTION)
    .updateOne(
      { _id: new ObjectId(jobId) },
      { $set: { status: JOB_STATUS.COMPLETED, result, updatedAt: new Date() } },
    );
}

export async function setJobFailed(db, jobId, error) {
  if (!ObjectId.isValid(jobId)) throw new ApiError(400, 'invalid jobId');
  await db.collection(COLLECTION).updateOne(
    { _id: new ObjectId(jobId) },
    {
      $set: {
        status: JOB_STATUS.FAILED,
        error: String(error),
        updatedAt: new Date(),
      },
    },
  );
}

export async function getEnvHealthJob(db, teamId, jobId) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!jobId || !ObjectId.isValid(jobId))
    throw new ApiError(404, 'Job not found');
  const doc = await db
    .collection(COLLECTION)
    .findOne({ _id: new ObjectId(jobId), teamId });
  if (!doc) throw new ApiError(404, 'Job not found');
  return toClientDoc(doc);
}

export async function computeEnvHealthReport(db, teamId) {
  const releases = await db
    .collection('releases')
    .find({ teamId })
    .sort({ createdAt: 1 })
    .project({ _id: 1, name: 1, environments: 1, archived: 1, createdAt: 1 })
    .toArray();

  if (releases.length === 0) {
    return { releases: [], environments: [], matrix: [], trend: [] };
  }

  const releaseIds = releases.map((r) => r._id.toString());

  const resultAgg = await db
    .collection('testResults')
    .aggregate([
      { $match: { teamId, releaseId: { $in: releaseIds } } },
      {
        $group: {
          _id: { releaseId: '$releaseId', environment: '$environment' },
          total: { $sum: 1 },
          passed: {
            $sum: { $cond: [{ $eq: ['$status', STATUS.PASS] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ['$status', STATUS.FAIL] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', STATUS.PENDING] }, 1, 0] },
          },
          knownIssue: {
            $sum: { $cond: [{ $eq: ['$status', STATUS.KNOWN_ISSUE] }, 1, 0] },
          },
        },
      },
    ])
    .toArray();

  const summaryMap = new Map();
  for (const row of resultAgg) {
    const key = `${row._id.releaseId}::${row._id.environment}`;
    const { total, passed, failed, pending, knownIssue } = row;
    summaryMap.set(key, {
      total,
      passed,
      failed,
      pending,
      knownIssue,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    });
  }

  const envSet = new Set();
  for (const release of releases) {
    for (const env of release.environments ?? []) envSet.add(env);
  }
  const environments = [...envSet].sort();

  const releasesSummary = releases.map((r) => ({
    _id: r._id.toString(),
    name: r.name,
    archived: r.archived ?? false,
  }));

  const matrix = environments.map((env) => ({
    environment: env,
    releases: releases.map((release) => {
      const key = `${release._id.toString()}::${env}`;
      const s = summaryMap.get(key) ?? null;
      return {
        releaseId: release._id.toString(),
        releaseName: release.name,
        archived: release.archived ?? false,
        hasData: s !== null,
        total: s?.total ?? 0,
        passed: s?.passed ?? 0,
        failed: s?.failed ?? 0,
        pending: s?.pending ?? 0,
        knownIssue: s?.knownIssue ?? 0,
        passRate: s?.passRate ?? 0,
      };
    }),
  }));

  const trend = releases.map((release) => {
    const envRates = {};
    let totalAll = 0;
    let passedAll = 0;
    for (const env of environments) {
      const key = `${release._id.toString()}::${env}`;
      const s = summaryMap.get(key);
      envRates[env] = s ? s.passRate : null;
      if (s) {
        totalAll += s.total;
        passedAll += s.passed;
      }
    }
    return {
      releaseId: release._id.toString(),
      releaseName: release.name,
      archived: release.archived ?? false,
      createdAt:
        release.createdAt instanceof Date
          ? release.createdAt.toISOString()
          : (release.createdAt ?? null),
      environments: envRates,
      overall: totalAll > 0 ? Math.round((passedAll / totalAll) * 100) : null,
    };
  });

  return { releases: releasesSummary, environments, matrix, trend };
}
