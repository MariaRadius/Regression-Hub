import { ObjectId } from 'mongodb';
import { toClientDoc } from '@/lib/db/util';
import { ApiError } from '@/lib/errors';
import { deriveInitial, nextInitialCandidate } from '@/utils/appInitial';

export async function listApplications(db, teamId) {
  if (!teamId) throw new Error('teamId required');
  const applications = await db
    .collection('applications')
    .find({ teamId })
    .sort({ name: 1 })
    .toArray();
  return applications.map((a) => toClientDoc(a));
}

/**
 * Creates a new application for a team.
 * Auto-derives a unique 3-char initial from the name if not provided;
 * rolls through candidates on collision.
 */
export async function createApplication(db, teamId, { name, initial }) {
  if (!teamId) throw new Error('teamId required');

  const existing = await db
    .collection('applications')
    .find({ teamId }, { projection: { initial: 1 } })
    .toArray();
  const taken = new Set(existing.map((a) => a.initial).filter(Boolean));

  let candidate = initial ?? deriveInitial(name);
  if (initial && taken.has(initial)) {
    throw new ApiError(409, `Initial "${initial}" is already in use`);
  }
  // Roll through candidates until a free one is found
  if (!initial) {
    if (taken.has(candidate)) {
      candidate = candidate.slice(0, 2) + '0';
      while (taken.has(candidate)) {
        candidate = nextInitialCandidate(candidate);
      }
    }
  }

  const doc = {
    name: name.trim(),
    initial: candidate,
    teamId,
    createdAt: new Date(),
  };
  try {
    const result = await db.collection('applications').insertOne(doc);
    return {
      _id: result.insertedId.toString(),
      name: doc.name,
      initial: candidate,
      teamId,
    };
  } catch (err) {
    if (err.code === 11000)
      throw new ApiError(409, 'Application already exists');
    throw err;
  }
}

/**
 * Deletes a team application by id.
 * Throws ApiError(409) if any test case still references it.
 *
 * @see {@link app/api/applications/[id]/__tests__/route.test.js}
 */
export async function deleteApplication(db, teamId, id) {
  if (!teamId) throw new Error('teamId required');
  const referenced = await db
    .collection('testCases')
    .countDocuments({ teamId, applicationId: id });
  if (referenced > 0) {
    throw new ApiError(409, 'Application is still referenced by test cases');
  }
  await db
    .collection('applications')
    .deleteOne({ _id: new ObjectId(id), teamId });
}
