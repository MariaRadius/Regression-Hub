/**
 * @param {string} initial
 * @param {number} serial
 * @returns {string}
 * @throws {Error} when `initial` is falsy
 * @see {@link lib/__tests__/db/sequences.test.js}
 */
export function formatTestKey(initial, serial) {
  if (!initial)
    throw new Error('Cannot build a testKey without an application initial');
  return `${initial}-${String(serial).padStart(4, '0')}`;
}

/**
 * Atomically increments the sequence for `applicationId` and returns the
 * next formatted testKey. Use for single-record creation; the bulk import
 * path pre-loads sequences for performance and uses formatTestKey directly.
 *
 * @param {import('mongodb').Db} db
 * @param {string} applicationId
 * @param {string} initial - 3-char application initial
 * @param {{ session?: import('mongodb').ClientSession }} [opts]
 * @returns {Promise<string>}
 * @throws {Error} when `initial` is falsy
 * @see {@link lib/__tests__/db/sequences.test.js}
 */
export async function mintTestKey(db, applicationId, initial, opts = {}) {
  if (!initial)
    throw new Error('Cannot mint a testKey without an application initial');
  const result = await db
    .collection('sequences')
    .findOneAndUpdate(
      { _id: applicationId },
      { $inc: { nextSerial: 1 } },
      { upsert: true, returnDocument: 'after', session: opts.session },
    );
  return formatTestKey(initial, result.nextSerial);
}
