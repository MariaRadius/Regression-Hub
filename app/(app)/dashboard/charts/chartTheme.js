// app/(app)/dashboard/charts/chartTheme.js

/**
 * Chart design tokens — aligned with the app's light MUI theme.
 *
 * Status colors mirror theme.js exactly:
 *   pass    → success.main  #03a769
 *   fail    → error.main    #e14d5a
 *   pending → warning.main  #f08d2f
 */
export const CHART_THEME = {
  pass: '#03a769', // bright emerald
  fail: '#e14d5a', // vivid rose red
  pending: '#f08d2f', // softened amber orange
  bg: '#ffffff', // chart card background (paper)
  surface: '#f9fafb', // donut inner / legend area (background.default)
  text: '#6b7280', // axis labels, legend text (theme text.disabled)
  grid: 'rgba(0,0,0,0.05)', // grid lines
  axis: '#e5e7eb', // axis baseline stroke (theme divider)
};

/**
 * Categorical palette for charts whose slices are entities (e.g. modules), not
 * statuses. Soft, low-saturation tints tuned to sit with the dashboard's airy
 * metric cards (mint / blush / peach) rather than shout over them — a blend of
 * cool and warm hues so slices stay distinguishable without feeling harsh.
 * `CATEGORICAL_OTHER` colors a rolled-up "Other" bucket.
 */
export const CATEGORICAL_PALETTE = [
  '#5cb8ac', // soft teal
  '#6fb4d1', // soft cyan
  '#f2a765', // soft peach
  '#e592a0', // soft blush
  '#8fbf8f', // soft sage
  '#9d93d1', // soft lavender
  '#7fc7bf', // soft mint
  '#e0b57e', // soft sand
];
export const CATEGORICAL_OTHER = '#c3cbd4'; // soft slate grey — the "Other" rollup

/**
 * Inline style object for chart tooltip containers.
 * Usage: <div style={TOOLTIP_STYLE}>...</div>
 * Plain CSS — no MUI dependency.
 */
export const TOOLTIP_STYLE = {
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  padding: '10px 12px',
  minWidth: 148,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
};

/**
 * Shared tick label props factory for visx axes.
 * @param {'start'|'middle'|'end'} textAnchor
 * @param {number} [fontSize=11]
 */
export const tickLabelProps = (textAnchor = 'end', fontSize = 11) => ({
  fill: CHART_THEME.text,
  fontSize,
  fontWeight: 500,
  letterSpacing: '0.02em',
  textAnchor,
  dy: '0.33em',
});

/** CSS animation injected into each chart SVG for a subtle entrance. */
export const CHART_FADE_IN_STYLE = `
  @keyframes chartFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;
