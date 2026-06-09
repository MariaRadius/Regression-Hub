import { NextResponse } from 'next/server';
import { getEnvHealthJob } from '@/lib/db/envHealthData';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (_request, context, { teamId, db }) => {
  const { jobId } = await context.params;
  const job = await getEnvHealthJob(db, teamId, jobId);
  return NextResponse.json(job);
});
