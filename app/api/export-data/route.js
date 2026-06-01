import { NextResponse } from 'next/server';
import { getExportData } from '@/lib/db/exportData';
import { withTeam } from '@/lib/server/withTeam';

export const GET = withTeam(async (request, _ctx, { teamId, db }) => {
  const { searchParams } = new URL(request.url);
  const query = {
    releaseId: searchParams.get('releaseId') || '',
    environment: searchParams.get('environment') || '',
    ...(searchParams.get('applicationId')
      ? { applicationId: searchParams.get('applicationId') }
      : {}),
  };
  const enriched = await getExportData(db, teamId, query);
  return NextResponse.json(enriched);
});
