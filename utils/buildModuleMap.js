import { STATUS } from '@/lib/constants';
import { normalizedStatus } from './formatters';

/**
 * Groups test cases by module and returns sorted summary rows.
 * @see utils/__tests__/buildModuleMap.test.js
 */
export function buildModuleMap(cases) {
  const map = {};
  for (const tc of cases) {
    const key = `${tc.moduleId || tc.moduleName}`;
    if (!map[key]) {
      map[key] = {
        module: tc.moduleName || '—',
        app: tc.applicationName || '—',
        total: 0,
        pass: 0,
        fail: 0,
        knownIssue: 0,
        pending: 0,
      };
    }
    map[key].total++;
    const st = normalizedStatus(tc.status);
    if (st === STATUS.PASS) map[key].pass++;
    else if (st === STATUS.FAIL) map[key].fail++;
    else if (st === STATUS.KNOWN_ISSUE) map[key].knownIssue++;
    else map[key].pending++;
  }
  return Object.values(map).sort((a, b) => a.module.localeCompare(b.module));
}
