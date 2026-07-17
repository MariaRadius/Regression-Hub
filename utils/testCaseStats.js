import { STATUS } from '@/lib/constants';
import { normalizedStatus } from './formatters';

/**
 * @see utils/__tests__/testCaseStats.test.js
 */
export function summarizeCases(cases) {
  const total = cases.length;
  const passed = cases.filter(
    (t) => normalizedStatus(t.status) === STATUS.PASS,
  ).length;
  const failed = cases.filter(
    (t) => normalizedStatus(t.status) === STATUS.FAIL,
  ).length;
  const knownIssue = cases.filter(
    (t) => normalizedStatus(t.status) === STATUS.KNOWN_ISSUE,
  ).length;
  const pending = total - passed - failed - knownIssue;
  const passPercent = total ? Math.round((passed / total) * 100) : 0;
  const failedCases = cases.filter(
    (t) => normalizedStatus(t.status) === STATUS.FAIL,
  );
  return {
    total,
    passed,
    failed,
    knownIssue,
    pending,
    passPercent,
    failedCases,
  };
}

/**
 * @see utils/__tests__/testCaseStats.test.js
 */
export function groupCasesByApplication(cases) {
  const appGroups = {};
  for (const tc of cases) {
    const an = tc.applicationName || 'Unknown';
    if (!appGroups[an]) appGroups[an] = [];
    appGroups[an].push(tc);
  }
  return Object.keys(appGroups)
    .sort()
    .map((name) => [name, appGroups[name]]);
}
