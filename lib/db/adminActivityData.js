import { ADMIN_SURFACE_CATEGORIES, AUDIT_CATEGORY } from '@/lib/constants';
import { appendEvent } from '@/lib/db/eventsData';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

export async function appendAdminActivity(db, teamId, event) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  await appendEvent(db, teamId, {
    category: event.category ?? AUDIT_CATEGORY.CONFIG,
    at: event.at ?? new Date(),
    adminSurface: true,
    ...event,
  });
}

export async function listAdminActivity(db, teamId, { limit = 100 } = {}) {
  if (!teamId) throw new ApiError(400, 'teamId required');

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  // Per-case IMPORT events (one per test case from Excel import) are excluded —
  // they flood the list. Only the summary IMPORT event (adminSurface: true) shows.
  const docs = await db
    .collection('events')
    .find({
      teamId,
      $or: [
        {
          category: {
            $in: ADMIN_SURFACE_CATEGORIES.filter(
              (c) => c !== AUDIT_CATEGORY.IMPORT,
            ),
          },
        },
        { category: AUDIT_CATEGORY.IMPORT, adminSurface: true },
      ],
    })
    .sort({ at: -1 })
    .limit(safeLimit)
    .toArray();

  return docs.map(toClientDoc);
}
