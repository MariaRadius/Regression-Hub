import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { acknowledgeDiscardedWatch } from '@/lib/db/jiraStoryWatchesData';
import { deleteTestCase, getTestCasesByStory } from '@/lib/db/testCasesData';
import { ApiError } from '@/lib/errors';
import { discardAcknowledgeBodySchema } from '@/lib/schemas/jira';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { withAdmin } from '@/lib/server/withTeam';

/**
 * POST /api/jira/stories/[storyKey]/discard-acknowledge
 *
 * Deletes the selected linked test cases and marks the story's discard
 * review as complete so it no longer appears in the discard panel.
 *
 * Admin-only — test case deletion is a destructive, irreversible action.
 *
 * Body: { deleteIds: string[] }
 *   deleteIds — subset of test case _ids to delete (may be empty).
 *
 * Returns: { ok: boolean, deleted: number, failed: { id, error }[] }
 */
export const POST = withAdmin(
  async (request, { params }, { teamId, db, session }) => {
    const { storyKey } = await params;
    if (!JIRA_KEY_RE.test(storyKey)) {
      throw new ApiError(400, 'Invalid storyKey format');
    }

    const body = await request.json().catch(() => ({}));
    const parsed = discardAcknowledgeBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        parsed.error.issues[0]?.message ?? 'Invalid body',
      );
    }

    const { deleteIds } = parsed.data;

    if (deleteIds.length > 0) {
      const existingCases = await getTestCasesByStory(db, teamId, storyKey);
      const ownedIds = new Set(existingCases.map((tc) => String(tc._id)));
      const unauthorized = deleteIds.filter((id) => !ownedIds.has(id));
      if (unauthorized.length > 0) {
        throw new ApiError(
          403,
          'Some test case IDs do not belong to this story',
        );
      }
    }

    const actor = session?.user?.name ?? 'unknown';
    const results = await Promise.allSettled(
      deleteIds.map((id) => deleteTestCase(db, teamId, id, { actor })),
    );

    const failed = results
      .map((r, i) => ({ id: deleteIds[i], result: r }))
      .filter(({ result }) => {
        if (result.status === 'fulfilled') return false;
        // Treat 404 as success — case was already deleted (retry scenario).
        return (
          result.reason?.statusCode !== 404 && result.reason?.status !== 404
        );
      })
      .map(({ id, result }) => ({
        id,
        error: result.reason?.message ?? 'Unknown error',
      }));

    if (failed.length === 0) {
      await acknowledgeDiscardedWatch(db, teamId, storyKey);
      revalidatePath('/(app)/test-cases', 'page');
      revalidatePath('/(app)/dashboard', 'page');
    }

    const deletedCount = deleteIds.length - failed.length;
    return NextResponse.json({
      ok: failed.length === 0,
      deleted: deletedCount,
      failed,
    });
  },
);
