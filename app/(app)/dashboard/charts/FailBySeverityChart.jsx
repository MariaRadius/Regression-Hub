// app/(app)/dashboard/charts/FailBySeverityChart.jsx
'use client';

import { PRIORITIES, STATUS } from '@/lib/constants';
import { SEVERITY_COLORS, SEVERITY_FALLBACK } from './chartTheme';
import FailurePieChart from './FailurePieChart';

const KNOWN_PRIORITIES = new Set(Object.values(PRIORITIES));

/**
 * Failure-only donut split by the failed case's test-case priority
 * (High/Medium/Low), so the severity of the failure load is legible at a
 * glance. Each known-priority slice links to the filtered test-case list;
 * unknown/blank priorities ('Unspecified') are not navigable.
 *
 * @see app/(app)/dashboard/charts/FailBySeverityChart.jsx
 * @param {{ name: string, priority: string, value: number }[]} severityData
 */
export default function FailBySeverityChart({ severityData }) {
  const data = severityData.map((d) => ({
    name: d.name,
    value: d.value,
    color: SEVERITY_COLORS[d.priority] ?? SEVERITY_FALLBACK,
    navHref: KNOWN_PRIORITIES.has(d.priority)
      ? `/test-cases?status=${STATUS.FAIL}&priority=${encodeURIComponent(d.priority)}`
      : null,
    subLabel: null,
  }));
  return (
    <FailurePieChart data={data} ariaLabel='Failures by severity donut chart' />
  );
}
