/** @see {@link lib/__tests__/db/util.test.js} */
export function toClientDoc(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  const serialized = {};
  for (const [key, val] of Object.entries(rest)) {
    serialized[key] = val instanceof Date ? val.toISOString() : val;
  }
  return {
    ...serialized,
    _id: _id !== null && _id !== undefined ? String(_id) : _id,
  };
}
