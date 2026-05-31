import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { importExcelWorkbook } from '@/lib/db/importExcelData';
import { ApiError } from '@/lib/errors';
import { withAdmin } from '@/lib/server/withTeam';

// Mirror the FE MIME set. Ambiguous types (octet-stream / empty) fall back to
// extension check — the FE already guards these, but the BE must not trust the client.
const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

function isValidXlsxFile(file) {
  const mime = file.type ?? '';
  if (mime === 'application/octet-stream' || mime === '') {
    return file.name?.toLowerCase().endsWith('.xlsx') ?? false;
  }
  return XLSX_MIMES.has(mime);
}

export const POST = withAdmin(async (request, _ctx, { teamId, db }) => {
  const formData = await request.formData();
  const file = formData.get('file');
  const softwareVersion = formData.get('softwareVersion') || '';
  const testEnvironment = formData.get('testEnvironment') || '';

  if (!file) throw new ApiError(400, 'No file uploaded');
  if (!isValidXlsxFile(file))
    throw new ApiError(
      400,
      'Invalid file type. Upload a .xlsx Excel workbook.',
    );

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await importExcelWorkbook(db, teamId, {
    buffer,
    fileName: file.name,
    softwareVersion: String(softwareVersion),
    testEnvironment: String(testEnvironment),
  });

  revalidatePath('/(app)/dashboard', 'page');
  revalidatePath('/(app)/test-cases', 'page');
  revalidatePath('/(app)/reports', 'page');
  return NextResponse.json(result);
});
