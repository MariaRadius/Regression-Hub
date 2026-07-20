// app/(app)/dashboard/charts/FailByModuleChart.jsx
'use client';

import { STATUS } from '@/lib/constants';
import { CATEGORICAL_OTHER, CATEGORICAL_PALETTE } from './chartTheme';
import FailurePieChart from './FailurePieChart';

const OTHER_NAME = 'Other';

// Palette color for a slice: the neutral "Other" hue for the rollup, otherwise
// a stable pastel color cycled by index.
function sliceColor(name, index) {
  if (name === OTHER_NAME) return CATEGORICAL_OTHER;
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

/**
 * Failure-only donut — one slice per failing module (plus an "Other" rollup),
 * so failures stay legible instead of collapsing into the overall status donut.
 * Module identity is revealed on hover; each real module slice links to its
 * filtered test-case list ("Other" is not navigable).
 *
 * @see app/(app)/dashboard/charts/FailByModuleChart.jsx
 * @param {{ name: string, moduleId: string | null, appName: string | null, value: number }[]} failData
 */
export default function FailByModuleChart({ failData }) {
  const data = failData.map((d, i) => ({
    id: d.moduleId ?? 'other',
    name: d.name,
    value: d.value,
    color: sliceColor(d.name, i),
    navHref: d.moduleId
      ? `/test-cases?status=${STATUS.FAIL}&moduleId=${d.moduleId}`
      : null,
    subLabel: d.appName ?? null,
  }));
  return (
    <FailurePieChart data={data} ariaLabel='Failures by module donut chart' />
  );
}
