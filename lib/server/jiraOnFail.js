import { JIRA_ISSUE_MODES } from '@/lib/constants';
import { getTeamSettings } from '@/lib/db/settingsData';
import { getTestCase } from '@/lib/db/testCasesData';
import { addResultJiraIssue } from '@/lib/db/testResultsData';
import {
  buildJiraIssueDraft,
  draftToJiraPayload,
  jiraIssueTypeForEnvironment,
  projectKeyFromStory,
} from '@/lib/jiraIssue';
import { createFailureIssue, isJiraConfigured } from '@/lib/server/jiraClient';

/**
 * Creates one issue from a finished draft: re-derives the story/project/type
 * server-side (the client controls only summary/description text), creates and
 * links the issue, and stores the key on the result row.
 *
 * @returns {Promise<{ created?: object, skipped?: object }>}
 */
async function createOne(
  db,
  teamId,
  { releaseId, environment, tcId, summary, description, sprintId },
  jiraBaseUrl,
) {
  const testCase = await getTestCase(db, teamId, tcId);
  const storyKey = testCase.jiraStory;
  const projectKey = projectKeyFromStory(storyKey);
  if (!projectKey) return { skipped: { tcId, reason: 'no-linked-story' } };

  const payload = draftToJiraPayload({
    projectKey,
    issueTypeName: jiraIssueTypeForEnvironment(environment),
    summary,
    description,
    sprintId: sprintId || undefined,
  });
  const { key, linkError } = await createFailureIssue(
    payload,
    storyKey,
    jiraBaseUrl,
  );
  await addResultJiraIssue(db, teamId, releaseId, tcId, environment, key);
  return { created: { tcId, key, ...(linkError ? { linkError } : {}) } };
}

/**
 * Auto-mode path: creates Jira issues for freshly recorded Fail results during
 * result recording, with the generated (unreviewed) draft text. Returns null
 * when nothing should be created — integration unconfigured, or mode is 'off'
 * or 'ask' (ask is handled by the client review flow via
 * buildDraftsForFailures / createIssuesFromDrafts).
 *
 * Jira failures never block result recording: per-case problems are collected
 * and returned, never thrown.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object} args
 * @param {{ name: string }} args.release
 * @param {string} args.releaseId
 * @param {string} args.environment
 * @param {Array<{ tcId: string, notes: string, testedBy: string }>} args.entries
 * @returns {Promise<null | {
 *   created: Array<{ tcId: string, key: string, linkError?: string }>,
 *   skipped: Array<{ tcId: string, reason: string }>,
 *   errors: Array<{ tcId: string, error: string }>,
 * }>}
 * @see {@link lib/server/__tests__/jiraOnFail.test.js}
 */
export async function createIssuesForFailures(
  db,
  teamId,
  { release, releaseId, environment, entries },
) {
  if (!isJiraConfigured()) return null;

  const settings = await getTeamSettings(db, teamId);
  const { jiraIssueMode } = settings;
  if (jiraIssueMode !== JIRA_ISSUE_MODES.AUTO) return null;
  const jiraBaseUrl = settings.jiraBaseUrl ?? process.env.JIRA_BASE_URL ?? null;

  const created = [];
  const skipped = [];
  const errors = [];

  for (const { tcId, notes, testedBy } of entries) {
    try {
      const testCase = await getTestCase(db, teamId, tcId);
      const draft = buildJiraIssueDraft({
        testCase,
        release,
        environment,
        notes,
        testedBy,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
      });
      if (!draft) {
        skipped.push({ tcId, reason: 'no-linked-story' });
        continue;
      }
      const outcome = await createOne(
        db,
        teamId,
        {
          releaseId,
          environment,
          tcId,
          summary: draft.summary,
          description: draft.description,
          sprintId: release.jiraSprintId,
        },
        jiraBaseUrl,
      );
      if (outcome.created) created.push(outcome.created);
      else skipped.push(outcome.skipped);
    } catch (err) {
      errors.push({ tcId, error: err.message });
    }
  }

  return { created, skipped, errors };
}

/**
 * Ask-mode step 1: builds one editable draft per failed case for the review
 * dialog. No Jira calls are made here. Story-less cases are reported as
 * skipped; when the integration is unconfigured or switched off both lists
 * are empty.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {object} args - Same shape as createIssuesForFailures.
 * @returns {Promise<{
 *   drafts: Array<{ tcId: string, summary: string, description: string }>,
 *   skipped: Array<{ tcId: string, reason: string }>,
 * }>}
 * @see {@link lib/server/__tests__/jiraOnFail.test.js}
 */
export async function buildDraftsForFailures(
  db,
  teamId,
  { release, environment, entries },
) {
  const empty = { drafts: [], skipped: [] };
  if (!isJiraConfigured()) return empty;

  const { jiraIssueMode } = await getTeamSettings(db, teamId);
  if (jiraIssueMode === JIRA_ISSUE_MODES.OFF) return empty;

  const drafts = [];
  const skipped = [];

  for (const { tcId, notes, testedBy } of entries) {
    const testCase = await getTestCase(db, teamId, tcId);
    const draft = buildJiraIssueDraft({
      testCase,
      release,
      environment,
      notes,
      testedBy,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
    if (!draft) skipped.push({ tcId, reason: 'no-linked-story' });
    else drafts.push({ tcId, ...draft });
  }

  return { drafts, skipped };
}

/**
 * Ask-mode step 2: creates the reviewed (possibly edited) drafts in Jira.
 * Only summary/description come from the client; story link, project, type,
 * and label are re-derived from the stored test case and environment.
 *
 * @param {import('mongodb').Db} db
 * @param {string} teamId
 * @param {{ releaseId: string, environment: string, issues: Array<{ tcId: string, summary: string, description: string }>, sprintId?: string|null }} args
 * @returns {Promise<{
 *   created: Array<{ tcId: string, key: string, linkError?: string }>,
 *   skipped: Array<{ tcId: string, reason: string }>,
 *   errors: Array<{ tcId: string, error: string }>,
 * }>}
 * @see {@link lib/server/__tests__/jiraOnFail.test.js}
 */
export async function createIssuesFromDrafts(
  db,
  teamId,
  { releaseId, environment, issues, sprintId },
) {
  const created = [];
  const skipped = [];
  const errors = [];

  const settings = await getTeamSettings(db, teamId);
  const jiraBaseUrl = settings.jiraBaseUrl ?? process.env.JIRA_BASE_URL ?? null;

  for (const { tcId, summary, description } of issues) {
    try {
      const outcome = await createOne(
        db,
        teamId,
        {
          releaseId,
          environment,
          tcId,
          summary,
          description,
          sprintId,
        },
        jiraBaseUrl,
      );
      if (outcome.created) created.push(outcome.created);
      else skipped.push(outcome.skipped);
    } catch (err) {
      errors.push({ tcId, error: err.message });
    }
  }

  return { created, skipped, errors };
}
