import { STATUS } from '@/lib/constants';

/**
 * Build donut-chart data from a summary object.
 * Entries with value === 0 are filtered out.
 *
 * @param {{ passed: number, failed: number, pending: number, total: number }} summary
 * @returns {{ name: string, value: number, total: number }[]}
 */
export function buildDonutData(summary) {
  return [
    { name: STATUS.PASS, value: summary.passed, total: summary.total },
    { name: STATUS.FAIL, value: summary.failed, total: summary.total },
    { name: STATUS.PENDING, value: summary.pending, total: summary.total },
  ].filter((d) => d.value > 0);
}

// Most module slices a failure-only pie shows before the rest roll into "Other".
const FAIL_BY_MODULE_TOP_N = 8;

/**
 * Build failure-only pie data from the failByModule list. Each slice is one
 * module's failed-test count, carrying the application name for context; modules
 * with no failures are excluded. Slices are sorted by fail count desc (name asc
 * as a deterministic tie-break). Only the top {@link FAIL_BY_MODULE_TOP_N}
 * modules are kept as their own slice; any remainder is summed into a single
 * `Other` slice (moduleId/appName null) so the pie stays readable when failures
 * spread across many modules.
 *
 * @param {{ moduleId: string | null, moduleName: string, appName: string | null, failed: number }[]} failByModule
 * @returns {{ name: string, appName: string | null, moduleId: string | null, value: number }[]}
 */
export function buildFailByModuleData(failByModule) {
  const failing = failByModule
    .filter((m) => m.failed > 0)
    .map((m) => ({
      name: m.moduleName,
      appName: m.appName ?? null,
      moduleId: m.moduleId,
      value: m.failed,
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  if (failing.length <= FAIL_BY_MODULE_TOP_N) return failing;

  const top = failing.slice(0, FAIL_BY_MODULE_TOP_N);
  const otherValue = failing
    .slice(FAIL_BY_MODULE_TOP_N)
    .reduce((sum, s) => sum + s.value, 0);
  if (otherValue > 0)
    top.push({
      name: 'Other',
      appName: null,
      moduleId: null,
      value: otherValue,
    });
  return top;
}

/**
 * Build module bar-chart data from the moduleGroups map.
 * Results are sorted by total desc (with DB-side sort as primary, JS sort as defensive
 * fallback) and sliced to 20. Name truncation is delegated to the chart component.
 *
 * @param {Record<string, { id: string, passed: number, failed: number, pending: number, total: number }>} moduleGroups
 * @returns {{ name: string, moduleId: string, [STATUS.PASS]: number, [STATUS.FAIL]: number, [STATUS.PENDING]: number }[]}
 */
export function buildModuleBarData(moduleGroups) {
  return Object.entries(moduleGroups)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 20)
    .map(([name, g]) => ({
      name,
      moduleId: g.id,
      [STATUS.PASS]: g.passed,
      [STATUS.FAIL]: g.failed,
      [STATUS.PENDING]: g.pending,
    }));
}

/**
 * Build app stacked bar-chart data from the modulesByApp map.
 * Percentages are computed from each app's total; result is sliced to 10 entries.
 *
 * @param {Record<string, { appId: string, passed: number, failed: number, pending: number, total: number }>} modulesByApp
 * @returns {{
 *   name: string,
 *   appId: string,
 *   passCount: number,
 *   failCount: number,
 *   pendingCount: number,
 *   total: number,
 *   [STATUS.PASS]: number,
 *   [STATUS.FAIL]: number,
 *   [STATUS.PENDING]: number,
 * }[]}
 */
export function buildAppBarData(modulesByApp) {
  return Object.entries(modulesByApp)
    .sort(([, a], [, b]) => b.total - a.total)
    .slice(0, 10)
    .map(([name, app]) => {
      const passPct = app.total
        ? parseFloat(((app.passed / app.total) * 100).toFixed(1))
        : 0;
      const failPct = app.total
        ? parseFloat(((app.failed / app.total) * 100).toFixed(1))
        : 0;
      const pendPct = app.total
        ? Math.max(0, parseFloat((100 - passPct - failPct).toFixed(1)))
        : 0;
      return {
        name,
        appId: app.appId,
        passCount: app.passed,
        failCount: app.failed,
        pendingCount: app.pending,
        total: app.total,
        [STATUS.PASS]: passPct,
        [STATUS.FAIL]: failPct,
        [STATUS.PENDING]: pendPct,
      };
    });
}

/**
 * Build tester bar-chart data from the testerGroups map.
 * Results are sorted by total desc (DB-side sort as primary, JS sort as defensive fallback).
 *
 * @param {Record<string, { passed: number, failed: number, pending: number, total: number }>} testerGroups
 * @returns {{ name: string, [STATUS.PASS]: number, [STATUS.FAIL]: number, [STATUS.PENDING]: number, total: number }[]}
 */
export function buildTesterBarData(testerGroups) {
  return Object.entries(testerGroups)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([name, g]) => ({
      name,
      [STATUS.PASS]: g.passed,
      [STATUS.FAIL]: g.failed,
      [STATUS.PENDING]: g.pending,
      total: g.total,
    }));
}
