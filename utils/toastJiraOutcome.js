import { showToast } from '@/utils/showToast';

/**
 * Surfaces a server-side Jira creation outcome (lib/server/jiraOnFail.js) as
 * toasts: created keys → success, skipped story-less cases → info, per-case
 * errors → warning. No-op for null/undefined (nothing was attempted).
 *
 * @param {{ created: Array<{key: string}>, skipped: Array<object>, errors: Array<{error: string}> }|null|undefined} jira
 * @see {@link utils/__tests__/toastJiraOutcome.test.js}
 */
export function toastJiraOutcome(jira) {
  if (!jira) return;
  if (jira.created.length) {
    const keys = jira.created.map((c) => c.key).join(', ');
    showToast(
      `Created Jira ${jira.created.length === 1 ? 'issue' : 'issues'} ${keys}`,
      'success',
    );
  }
  if (jira.skipped.length) {
    showToast(
      `${jira.skipped.length} ${jira.skipped.length === 1 ? 'case has' : 'cases have'} no linked Jira Story — no issue created`,
      'info',
    );
  }
  for (const { error } of jira.errors) {
    showToast(
      `Result saved, but Jira issue creation failed: ${error}`,
      'warning',
    );
  }
}
