import { NextResponse } from 'next/server';
import { getRelease } from '@/lib/db/releasesData';
import { saveSnapshot } from '@/lib/db/reportSnapshotsData';
import { ApiError } from '@/lib/errors';
import { withTeam } from '@/lib/server/withTeam';

/**
 * POST /api/releases/[id]/snapshot
 *
 * Accepts a multipart upload (file, environment, filename) and stores the PDF
 * as the single snapshot for the given release + environment combination. Any
 * prior snapshot for the same combo is replaced.
 *
 * Returns the saved snapshot metadata document.
 *
 * @see {@link app/api/releases/[id]/__tests__/snapshot.route.test.js}
 */
export const POST = withTeam(
  async (request, context, { session, teamId, db }) => {
    const { id } = await context.params;

    // Validate release ownership — getRelease throws ApiError(404) if missing.
    const release = await getRelease(db, teamId, id);

    const formData = await request.formData();
    const file = formData.get('file');
    const environment = (formData.get('environment') ?? '').toString().trim();
    const filename = (formData.get('filename') ?? '').toString().trim();

    if (!environment) {
      throw new ApiError(400, 'environment required');
    }

    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new ApiError(400, 'No file uploaded');
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const generatedBy = session.user.name ?? session.user.email;

    const meta = await saveSnapshot(db, teamId, {
      releaseId: id,
      releaseName: release.name,
      environment,
      generatedBy,
      buffer,
      filename: filename || file.name,
    });

    return NextResponse.json(meta);
  },
);
