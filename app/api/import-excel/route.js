import { NextResponse } from 'next/server';
import { withAdmin } from '@/lib/server/withTeam';
import { importExcelWorkbook } from '@/lib/db/importExcelData';
import { ApiError } from '@/lib/errors';

export const POST = withAdmin(async (request, _ctx, { teamId, db }) => {
  const formData = await request.formData();
  const file = formData.get('file');
  const softwareVersion = formData.get('softwareVersion') || '';
  const testEnvironment = formData.get('testEnvironment') || '';

  if (!file) throw new ApiError(400, 'No file uploaded');

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await importExcelWorkbook(db, teamId, {
    buffer,
    fileName: file.name,
    softwareVersion: String(softwareVersion),
    testEnvironment: String(testEnvironment),
  });

  return NextResponse.json(result);
});
