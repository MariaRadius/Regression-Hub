import { after, NextResponse } from 'next/server';
import {
  computeEnvHealthReport,
  createEnvHealthJob,
  setJobCompleted,
  setJobFailed,
  setJobProcessing,
} from '@/lib/db/envHealthData';
import { getDb } from '@/lib/mongodb';
import { withTeam } from '@/lib/server/withTeam';

export const POST = withTeam(
  async (_request, _ctx, { teamId, db, session }) => {
    const jobId = await createEnvHealthJob(
      db,
      teamId,
      session.user?.name ?? session.user?.email ?? null,
    );

    after(async () => {
      const bgDb = await getDb();
      try {
        await setJobProcessing(bgDb, jobId);
        const result = await computeEnvHealthReport(bgDb, teamId);
        await setJobCompleted(bgDb, jobId, result);
      } catch (err) {
        await setJobFailed(bgDb, jobId, err?.message ?? 'Unknown error').catch(
          () => {},
        );
      }
    });

    return NextResponse.json({ jobId }, { status: 202 });
  },
);
