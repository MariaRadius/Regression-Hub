export function dashboardPercent(value, total) {
  if (!total || !value) return 0;
  if (value >= total) return 100;

  const percent = (value / total) * 100;
  const rounded = Math.round(percent * 100) / 100;
  if (rounded === 0) return 0.01;
  if (rounded === 100) return 99.99;
  return rounded;
}

export function formatDashboardPercent(value, total) {
  return `${dashboardPercent(value, total)}%`;
}
