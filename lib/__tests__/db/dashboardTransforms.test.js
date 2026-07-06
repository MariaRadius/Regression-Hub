import { describe, expect, it } from 'vitest';
import {
  buildFailByModuleData,
  buildFailBySeverityData,
} from '@/lib/db/dashboardTransforms';

const mod = (moduleId, failed, moduleName = moduleId, appName = 'App A') => ({
  moduleId,
  moduleName,
  appName,
  failed,
});

describe('buildFailByModuleData', () => {
  it('returns one slice per failing module, sorted by fail count desc', () => {
    const rows = [
      mod('m1', 3, 'Login'),
      mod('m2', 8, 'Checkout'),
      mod('m3', 5, 'Search'),
    ];
    expect(buildFailByModuleData(rows)).toEqual([
      { name: 'Checkout', appName: 'App A', moduleId: 'm2', value: 8 },
      { name: 'Search', appName: 'App A', moduleId: 'm3', value: 5 },
      { name: 'Login', appName: 'App A', moduleId: 'm1', value: 3 },
    ]);
  });

  it('carries the application name and keeps same-named modules distinct', () => {
    const rows = [
      mod('m1', 6, 'Orders', 'Practice Admin'),
      mod('m2', 4, 'Orders', 'Super Admin'),
    ];
    expect(buildFailByModuleData(rows)).toEqual([
      { name: 'Orders', appName: 'Practice Admin', moduleId: 'm1', value: 6 },
      { name: 'Orders', appName: 'Super Admin', moduleId: 'm2', value: 4 },
    ]);
  });

  it('excludes modules with zero failures', () => {
    const rows = [mod('m1', 4, 'Login'), mod('m2', 0, 'Clean')];
    expect(buildFailByModuleData(rows)).toEqual([
      { name: 'Login', appName: 'App A', moduleId: 'm1', value: 4 },
    ]);
  });

  it('tie-breaks equal fail counts by module name ascending', () => {
    const rows = [mod('m1', 2, 'Zebra'), mod('m2', 2, 'Alpha')];
    expect(buildFailByModuleData(rows)).toEqual([
      { name: 'Alpha', appName: 'App A', moduleId: 'm2', value: 2 },
      { name: 'Zebra', appName: 'App A', moduleId: 'm1', value: 2 },
    ]);
  });

  it('keeps top 8 modules and rolls the remainder into an Other slice', () => {
    // 10 failing modules with fail counts 10..1
    const rows = Array.from({ length: 10 }, (_, i) =>
      mod(`m${i}`, 10 - i, `Mod${i}`),
    );
    const result = buildFailByModuleData(rows);
    expect(result).toHaveLength(9); // 8 modules + Other
    expect(result.slice(0, 8).map((s) => s.value)).toEqual([
      10, 9, 8, 7, 6, 5, 4, 3,
    ]);
    // remainder: fail counts 2 + 1 = 3; the Other rollup has no module/app.
    expect(result[8]).toEqual({
      name: 'Other',
      appName: null,
      moduleId: null,
      value: 3,
    });
  });

  it('does not add an Other slice when there are 8 or fewer failing modules', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      mod(`m${i}`, 8 - i, `Mod${i}`),
    );
    const result = buildFailByModuleData(rows);
    expect(result).toHaveLength(8);
    expect(result.some((s) => s.name === 'Other')).toBe(false);
  });

  it('returns an empty array when there are no failures', () => {
    const rows = [mod('m1', 0, 'Login'), mod('m2', 0, 'Search')];
    expect(buildFailByModuleData(rows)).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(buildFailByModuleData([])).toEqual([]);
  });
});

describe('buildFailBySeverityData', () => {
  it('orders slices High → Medium → Low regardless of input order', () => {
    const rows = [
      { priority: 'Low', failed: 2 },
      { priority: 'High', failed: 5 },
      { priority: 'Medium', failed: 3 },
    ];
    expect(buildFailBySeverityData(rows)).toEqual([
      { name: 'High', priority: 'High', value: 5 },
      { name: 'Medium', priority: 'Medium', value: 3 },
      { name: 'Low', priority: 'Low', value: 2 },
    ]);
  });

  it('drops zero-failure buckets and sorts unknown priorities last', () => {
    const rows = [
      { priority: 'Unspecified', failed: 1 },
      { priority: 'Medium', failed: 0 },
      { priority: 'High', failed: 4 },
    ];
    expect(buildFailBySeverityData(rows)).toEqual([
      { name: 'High', priority: 'High', value: 4 },
      { name: 'Unspecified', priority: 'Unspecified', value: 1 },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(buildFailBySeverityData([])).toEqual([]);
  });
});
