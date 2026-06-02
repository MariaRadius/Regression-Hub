import { STATUS } from '@/lib/constants';
import { dashboardPercent } from '@/lib/dashboardPercent';

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
      const passPct = dashboardPercent(app.passed, app.total);
      const failPct = dashboardPercent(app.failed, app.total);
      const pendPct = dashboardPercent(app.pending, app.total);
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
