import { cache } from 'react';

/**
 * Returns test runs for the given team, projected to only the fields needed for display and reporting.
 * Wrapped with React.cache() for per-request deduplication.
 *
 * @see {@link app/(app)/test-runs/page.js}
 * @see {@link app/api/test-runs/route.js}
 */
export const listTestRuns = cache(async function listTestRuns(db, teamId) {
  return db
    .collection('testRuns')
    .find({ teamId })
    .project({
      uploadedFileName: 1,
      testEnvironment: 1,
      softwareVersion: 1,
      importedCount: 1,
      totalInFile: 1,
      updatedCount: 1,
      duplicatesSkipped: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1 })
    .toArray();
});
