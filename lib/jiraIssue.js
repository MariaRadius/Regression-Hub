import { JIRA_ISSUE_TYPES } from '@/lib/constants';
import { JIRA_KEY_RE } from '@/lib/schemas/testCases';
import { htmlToPlainText } from '@/utils/htmlToPlainText';

/**
 * Issue type created for a failure in the given environment.
 * Production failures are real defects (Bug); failures anywhere else
 * (QA, Sandbox, custom envs) are in-sprint Test Issues.
 *
 * @param {string} environment
 * @returns {string} A JIRA_ISSUE_TYPES value.
 * @see {@link lib/__tests__/jiraIssue.test.js}
 */
export function jiraIssueTypeForEnvironment(environment) {
  // Case-insensitive: stored environments vary ("Production" vs "PRODUCTION").
  return environment?.toLowerCase() === 'production'
    ? JIRA_ISSUE_TYPES.BUG
    : JIRA_ISSUE_TYPES.TEST_ISSUE;
}

/**
 * Derives the Jira project key from a story key ("RXR-9012" → "RXR").
 *
 * @param {string|null|undefined} storyKey
 * @returns {string|null} Project key, or null when the story key is absent/malformed.
 */
export function projectKeyFromStory(storyKey) {
  if (!storyKey || !JIRA_KEY_RE.test(storyKey)) return null;
  return storyKey.split('-')[0];
}

/**
 * Builds the editable draft for a failed test result: a summary line and a
 * structured plain-text description assembled from the test case (steps to
 * reproduce, expected result) and the QA's failure notes. This is the text the
 * review dialog shows; `draftToJiraPayload` converts the (possibly edited)
 * draft into a REST create-issue body.
 *
 * Returns null when the test case has no valid linked story (no project to
 * target).
 *
 * @param {object} args
 * @param {{ testKey?: string, testCase: string, jiraStory?: string|null, moduleName?: string, priority?: string, steps?: string, expectedResult?: string }} args.testCase
 * @param {{ name: string }} args.release
 * @param {string} args.environment
 * @param {string} args.notes - Failure notes from the fail dialog.
 * @param {string} args.testedBy
 * @param {string} [args.appUrl] - Base URL for the link back to regression-hub.
 * @returns {{ summary: string, description: string }|null}
 * @see {@link lib/__tests__/jiraIssue.test.js}
 */
export function buildJiraIssueDraft({
  testCase,
  release,
  environment,
  notes,
  testedBy,
  appUrl,
}) {
  if (!projectKeyFromStory(testCase?.jiraStory)) return null;

  const sections = [
    `Test case: ${testCase.testKey ? `${testCase.testKey} — ` : ''}${testCase.testCase}`,
    `Module: ${testCase.moduleName ?? 'Unknown'} · Priority: ${testCase.priority ?? 'Unknown'}`,
    `Release: ${release.name} · Environment: ${environment}`,
  ];

  const steps = htmlToPlainText(testCase.steps);
  if (steps) sections.push(`Steps to Reproduce:\n${steps}`);

  const expected = htmlToPlainText(testCase.expectedResult);
  if (expected) sections.push(`Expected Result:\n${expected}`);

  sections.push(`Actual Result:\n${notes}`);
  sections.push(`Recorded by: ${testedBy}`);
  if (appUrl) sections.push(`Recorded in regression-hub: ${appUrl}/test-cases`);

  return {
    summary: `[${environment}] ${testCase.testCase} — failed in ${release.name}`,
    description: sections.join('\n\n'),
  };
}

/**
 * Converts a (possibly user-edited) draft into a Jira REST v3 create-issue
 * payload. Each description line becomes an ADF paragraph; project, type, and
 * the `regression-hub` label are supplied by the server, never the client.
 *
 * @param {{ projectKey: string, issueTypeName: string, summary: string, description: string, fixVersionName?: string }} args
 *   `fixVersionName` (e.g. "testRelease") groups created issues under a Jira
 *   Release; the version must already exist in the target project.
 * @returns {{ fields: object }}
 * @see {@link lib/__tests__/jiraIssue.test.js}
 */
export function draftToJiraPayload({
  projectKey,
  issueTypeName,
  summary,
  description,
  fixVersionName,
}) {
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: issueTypeName },
      ...(fixVersionName ? { fixVersions: [{ name: fixVersionName }] } : {}),
      // Stable label so Jira Automation rules (e.g. Rovo Agent triage) can
      // target issues created by this integration.
      labels: ['regression-hub'],
      summary,
      description: {
        type: 'doc',
        version: 1,
        content: description
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => ({
            type: 'paragraph',
            content: [{ type: 'text', text: line }],
          })),
      },
    },
  };
}
