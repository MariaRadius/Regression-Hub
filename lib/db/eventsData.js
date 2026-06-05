import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';

/**
 * Inserts a single event into the events collection.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object} event - Fields to record (category, action, tcId, …).
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendEvent(db, teamId, event) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  await db.collection('events').insertOne({ teamId, ...event });
}

/**
 * Inserts multiple events via insertMany. No-op when events is empty.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object[]} events
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function appendEvents(db, teamId, events) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  if (!events.length) return;
  const docs = events.map((e) => ({ teamId, ...e }));
  await db.collection('events').insertMany(docs);
}

/**
 * Returns all events for a team, optionally scoped to one tcId or releaseId,
 * sorted newest-first.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ tcId?: string, releaseId?: string, categories?: string[] }} opts
 * @returns {Promise<object[]>}
 * @see {@link lib/__tests__/db/eventsData.test.js}
 */
export async function listEvents(
  db,
  teamId,
  { tcId, releaseId, categories } = {},
) {
  if (!teamId) throw new ApiError(400, 'teamId required');
  const query = { teamId };
  if (tcId) query.tcId = tcId;
  if (releaseId) query.releaseId = releaseId;
  if (categories?.length) query.category = { $in: categories };
  const docs = await db
    .collection('events')
    .find(query)
    .sort({ at: -1 })
    .toArray();
  return docs.map(toClientDoc);
}
