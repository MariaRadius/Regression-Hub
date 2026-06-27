import { describe, expect, it } from 'vitest';
import { JIRA_ISSUE_TYPES } from '@/lib/constants';
import {
  buildJiraIssueDraft,
  draftToJiraPayload,
  jiraIssueTypeForEnvironment,
  projectKeyFromStory,
} from '@/lib/jiraIssue';

const testCase = {
  _id: 'tc1',
  testKey: 'SAP-0454',
  testCase: 'Login persists across restarts',
  jiraStory: 'RXR-9012',
  moduleName: 'Auth',
  priority: 'High',
  steps: '<ol><li>Open app</li><li>Sign in</li><li>Relaunch</li></ol>',
  expectedResult: 'User stays signed in.',
};

const release = { _id: 'rel1', name: 'v2.9' };

function buildDraft(overrides = {}) {
  return buildJiraIssueDraft({
    testCase,
    release,
    environment: 'QA',
    notes: 'Crashed on relaunch',
    testedBy: 'Maria',
    appUrl: 'http://localhost:3001',
    ...overrides,
  });
}

describe('jiraIssueTypeForEnvironment', () => {
  it('maps Production to Bug regardless of casing (real data uses PRODUCTION)', () => {
    expect(jiraIssueTypeForEnvironment('Production')).toBe(
      JIRA_ISSUE_TYPES.BUG,
    );
    expect(jiraIssueTypeForEnvironment('PRODUCTION')).toBe(
      JIRA_ISSUE_TYPES.BUG,
    );
    expect(jiraIssueTypeForEnvironment('production')).toBe(
      JIRA_ISSUE_TYPES.BUG,
    );
  });

  it('maps every non-Production environment (incl. custom) to Test Issue', () => {
    expect(jiraIssueTypeForEnvironment('QA')).toBe(JIRA_ISSUE_TYPES.TEST_ISSUE);
    expect(jiraIssueTypeForEnvironment('Sandbox')).toBe(
      JIRA_ISSUE_TYPES.TEST_ISSUE,
    );
    expect(jiraIssueTypeForEnvironment('Staging-EU')).toBe(
      JIRA_ISSUE_TYPES.TEST_ISSUE,
    );
  });
});

describe('projectKeyFromStory', () => {
  it('derives the project key from a story key', () => {
    expect(projectKeyFromStory('RXR-9012')).toBe('RXR');
  });

  it('returns null for missing or malformed keys', () => {
    expect(projectKeyFromStory(undefined)).toBeNull();
    expect(projectKeyFromStory('')).toBeNull();
    expect(projectKeyFromStory('not-a-key')).toBeNull();
  });
});

describe('buildJiraIssueDraft', () => {
  it('builds the summary as "test case title" when no applicationName', () => {
    expect(buildDraft().summary).toBe('Login persists across restarts');
  });

  it('prefixes the summary with applicationName when provided', () => {
    expect(buildDraft({ applicationName: 'Super Admin' }).summary).toBe(
      'Super Admin: Login persists across restarts',
    );
  });

  it('includes steps to reproduce flattened from HTML', () => {
    const { description } = buildDraft();
    expect(description).toContain('STEPS TO REPRODUCE');
    expect(description).toContain('1. Open app');
    expect(description).toContain('2. Sign in');
    expect(description).toContain('3. Relaunch');
  });

  it('includes all structured sections and context lines', () => {
    const { description } = buildDraft();
    expect(description).toContain('DESCRIPTION');
    expect(description).toContain(
      'This issue was automatically logged from a failed regression test.',
    );
    expect(description).toContain('EXPECTED RESULT\nUser stays signed in.');
    expect(description).toContain('ACTUAL RESULT\nCrashed on relaunch');
    expect(description).toContain('TEST INFO');
    expect(description).toContain('SAP-0454');
    expect(description).toContain('Module: Auth | Priority: High');
    expect(description).toContain('Release: v2.9 | Environment: QA');
    expect(description).toContain('Reported by: Maria');
    expect(description).toContain(
      'Regression Hub: http://localhost:3001/test-cases',
    );
  });

  it('omits the steps section when the test case has none', () => {
    const { description } = buildDraft({
      testCase: { ...testCase, steps: '' },
    });
    expect(description).not.toContain('STEPS TO REPRODUCE');
  });

  it('returns null when the test case has no linked story', () => {
    expect(
      buildDraft({ testCase: { ...testCase, jiraStory: null } }),
    ).toBeNull();
  });
});

describe('draftToJiraPayload', () => {
  const args = {
    projectKey: 'RXR',
    issueTypeName: JIRA_ISSUE_TYPES.TEST_ISSUE,
    summary: '[QA] Login — failed in v2.9',
    description: 'Line one\nLine two',
  };

  it('targets the project and issue type with the regression-hub label', () => {
    const payload = draftToJiraPayload(args);
    expect(payload.fields.project).toEqual({ key: 'RXR' });
    expect(payload.fields.issuetype).toEqual({
      name: JIRA_ISSUE_TYPES.TEST_ISSUE,
    });
    expect(payload.fields.labels).toEqual(['regression-hub']);
    expect(payload.fields.summary).toBe('[QA] Login — failed in v2.9');
  });

  it('converts each description line into an ADF paragraph', () => {
    const { description } = draftToJiraPayload(args).fields;
    expect(description.type).toBe('doc');
    expect(description.version).toBe(1);
    expect(description.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Line one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Line two' }] },
    ]);
  });

  it('sets the sprint field when a sprintId is supplied, omits it otherwise', () => {
    const withSprint = draftToJiraPayload({ ...args, sprintId: '42' });
    expect(withSprint.fields.customfield_10020).toBe(42);

    expect(draftToJiraPayload(args).fields.customfield_10020).toBeUndefined();
  });
});
