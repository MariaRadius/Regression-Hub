import { Readable } from 'node:stream';
import { getSnapshotFile } from '@/lib/db/reportSnapshotsData';
import { withTeam } from '@/lib/server/withTeam';

/**
 * GET /api/snapshots/[id]/download
 *
 * Streams the stored PDF bytes for a snapshot from GridFS.
 * Returns the raw binary response with Content-Disposition: attachment.
 * Errors (404, 400, 401) are handled by the withTeam wrapper.
 *
 * @see {@link app/api/snapshots/[id]/__tests__/route.test.js}
 */
export const GET = withTeam(async (_request, context, { teamId, db }) => {
  const { id } = await context.params;
  const { stream, filename, byteSize, contentType } = await getSnapshotFile(
    db,
    teamId,
    id,
  );
  const webStream = Readable.toWeb(stream);
  return new Response(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(byteSize),
    },
  });
});
