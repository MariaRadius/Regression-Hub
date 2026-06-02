/**
 * Unit tests for the pure `buildReportRows(releases, snapshots)` row-builder.
 *
 * Covers spec §4 (Table rows) and §7:
 *  - one row per non-archived release × environment;
 *  - saved copy joined by `releaseId::environment`;
 *  - orphaned saved copies (archived/renamed release) appended as download-only rows;
 *  - archived releases excluded from generatable rows;
 *  - stable sort by release name then environment.
 *
 * @see {@link app/(app)/reports/ReportsClient.jsx}
 */

import { describe, expect, it } from 'vitest';
import { buildReportRows } from '../ReportsClient';

const REL_A = { _id: 'a', name: 'Alpha 1.0', environments: ['DEV', 'QA'] };
const REL_B = { _id: 'b', name: 'Bravo 2.0', environments: ['QA'] };

function snap(overrides) {
  return {
    _id: `s-${overrides.releaseId}-${overrides.environment}`,
    releaseId: overrides.releaseId,
    releaseName: overrides.releaseName ?? 'snap-name',
    environment: overrides.environment,
    generatedBy: 'Alice',
    generatedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildReportRows', () => {
  it('emits one generatable row per non-archived release × environment', () => {
    const rows = buildReportRows([REL_A, REL_B], []);

    expect(rows).toHaveLength(3); // A:DEV, A:QA, B:QA
    expect(rows.every((r) => r.generatable === true)).toBe(true);
    expect(rows.every((r) => r.snapshot === null)).toBe(true);
  });

  it('left-joins a saved copy by releaseId::environment', () => {
    const s = snap({
      releaseId: 'a',
      environment: 'QA',
      releaseName: 'Alpha 1.0',
    });
    const rows = buildReportRows([REL_A], [s]);

    const qaRow = rows.find(
      (r) => r.releaseId === 'a' && r.environment === 'QA',
    );
    const devRow = rows.find(
      (r) => r.releaseId === 'a' && r.environment === 'DEV',
    );

    expect(qaRow.snapshot).toBe(s);
    expect(devRow.snapshot).toBeNull();
  });

  it('appends a download-only row for a snapshot whose release is not active', () => {
    const orphan = snap({
      releaseId: 'gone',
      environment: 'QA',
      releaseName: 'Archived 0.9',
    });
    const rows = buildReportRows([REL_A], [orphan]);

    const orphanRow = rows.find((r) => r.releaseId === 'gone');
    expect(orphanRow).toBeDefined();
    expect(orphanRow.generatable).toBe(false);
    expect(orphanRow.snapshot).toBe(orphan);
    expect(orphanRow.releaseName).toBe('Archived 0.9');
  });

  it('does not duplicate a row when the snapshot matches an active release row', () => {
    const s = snap({
      releaseId: 'b',
      environment: 'QA',
      releaseName: 'Bravo 2.0',
    });
    const rows = buildReportRows([REL_B], [s]);

    expect(rows).toHaveLength(1);
    expect(rows[0].snapshot).toBe(s);
    expect(rows[0].generatable).toBe(true);
  });

  it('excludes archived releases from generatable rows', () => {
    const archived = { ...REL_B, archived: true };
    const rows = buildReportRows([REL_A, archived], []);

    expect(rows.some((r) => r.releaseId === 'b')).toBe(false);
    expect(rows).toHaveLength(2); // only Alpha's two envs
  });

  it('sorts by release name then environment', () => {
    const rows = buildReportRows([REL_B, REL_A], []);

    expect(rows.map((r) => `${r.releaseName}:${r.environment}`)).toEqual([
      'Alpha 1.0:DEV',
      'Alpha 1.0:QA',
      'Bravo 2.0:QA',
    ]);
  });

  it('returns an empty array when there are no releases and no snapshots', () => {
    expect(buildReportRows([], [])).toEqual([]);
  });
});
