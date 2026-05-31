// app/(app)/dashboard/charts/chartTheme.js

/**
 * Chart design tokens — aligned with the app's light MUI theme.
 *
 * Status colors mirror theme.js exactly:
 *   pass    → primary.main  #0d9488
 *   fail    → error.main    #dc2626
 *   pending → warning.main  #d97706
 */
export const CHART_THEME = {
  pass: '#0d9488', // teal  — mirrors theme primary.main
  fail: '#dc2626', // red   — mirrors theme error.main
  pending: '#d97706', // amber — mirrors theme warning.main
  bg: '#ffffff', // chart card background (paper)
  surface: '#f9fafb', // donut inner / legend area (background.default)
  text: '#6b7280', // axis labels, legend text (theme text.disabled)
  grid: 'rgba(0,0,0,0.05)', // grid lines
  axis: '#e5e7eb', // axis baseline stroke (theme divider)
};

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
