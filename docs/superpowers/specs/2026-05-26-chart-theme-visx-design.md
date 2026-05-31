# Chart Theme & visx Migration — Design Spec

**Date:** 2026-05-26  
**Branch:** worktree-chart-theme-design  
**Jira:** TBD (assign before implementation commit)

---

## 1. Goal

Migrate the dashboard charts from Recharts to visx, and apply the **Carbon Teal** theme — a near-black dark canvas with high-contrast, semantically meaningful status colors. The result eliminates the SSR bypass hack (`DynamicCharts.jsx`) and delivers clean, professional charts with a consistent design language.

---

## 2. Final Color Token System

All tokens live in `app/(app)/dashboard/charts/chartTheme.js` (replaces `chartUtils.js`).

| Token     | Value                    | Meaning                         |
| --------- | ------------------------ | ------------------------------- |
| `pass`    | `#14b8a6`                | Teal — positive, passing        |
| `fail`    | `#f43f5e`                | Rose-crimson — failure          |
| `pending` | `#fbbf24`                | Amber — in progress / untested  |
| `bg`      | `#111113`                | Chart card background           |
| `surface` | `#1c1c1f`                | Donut inner fill / card surface |
| `text`    | `#a1a1aa`                | Axis labels, legend text        |
| `grid`    | `rgba(255,255,255,0.07)` | Horizontal grid lines           |
| `axis`    | `#27272a`                | Axis baseline stroke            |

### Dashboard background mode

**Option B — dark page, lifted cards.**  
Page background: `#0a0a0c`. Chart MUI cards use `bg: #111113` with a `1px solid rgba(255,255,255,0.08)` border. Cards are visually lifted from the page, giving each chart a defined frame.

---

## 3. Scope of Changes

### 3.1 New / changed files

| File                                                | Action     | Notes                                                              |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `app/(app)/dashboard/charts/chartTheme.js`          | Create     | Replaces `chartUtils.js`. Exports token object + `TOOLTIP_BOX_SX`. |
| `app/(app)/dashboard/charts/TesterBarChart.jsx`     | Rewrite    | Recharts → visx horizontal stacked bar                             |
| `app/(app)/dashboard/charts/ModuleBarChart.jsx`     | Rewrite    | Recharts → visx grouped vertical bar                               |
| `app/(app)/dashboard/charts/AppStackedBarChart.jsx` | Rewrite    | Recharts → visx stacked % vertical bar                             |
| `app/(app)/dashboard/charts/DonutChart.jsx`         | Rewrite    | Recharts → visx pie/arc donut                                      |
| `components/SummaryRow.jsx`                         | Replace    | Drop recharts; use a plain CSS flex bar (no SVG library needed)    |
| `app/(app)/dashboard/charts/DynamicCharts.jsx`      | **Delete** | SSR bypass no longer needed with visx                              |
| `app/(app)/dashboard/page.js`                       | Update     | Import charts directly; remove DynamicCharts reference             |
| `app/(app)/dashboard/layout.js` (if exists)         | Update     | Apply `#0a0a0c` page background via MUI `sx` or globals            |
| `vitest.setup.js`                                   | Update     | Remove `global.ResizeObserver` stub (no longer needed)             |
| `components/__tests__/SummaryRow.test.jsx`          | Update     | Remove `.recharts-responsive-container` assertion                  |

### 3.2 New npm packages

```
@visx/scale
@visx/shape
@visx/axis
@visx/grid
@visx/group
@visx/tooltip
@visx/responsive
@visx/legend
```

Remove: `recharts` from `package.json` (after all charts are migrated).

---

## 4. Chart-by-Chart Design

### 4.1 Shared infrastructure

**`chartTheme.js`** exports:

```js
export const CHART_THEME = {
  pass,
  fail,
  pending,
  bg,
  surface,
  text,
  grid,
  axis,
};
export const TOOLTIP_BOX_SX = {
  /* MUI sx for custom tooltip boxes */
};
```

**Responsive sizing:** All 4 dashboard charts use `useParentSize()` from `@visx/responsive` inside a `'use client'` component. No `ResponsiveContainer`. The parent `<div>` controls dimensions (unchanged from today).

**Custom tooltips:** All charts already use custom `<Tooltip content={...}>` — migrate to `useTooltip` + `TooltipWithBounds` from `@visx/tooltip`. Shape and logic carry over.

**Interactivity (click + hover):** All existing `onClick` navigation and `onMouseEnter`/`onMouseLeave` hover state carry over directly to visx SVG element event handlers.

---

### 4.2 TesterBarChart — horizontal stacked bar

- **Scale:** `scaleBand` (Y, tester names) + `scaleLinear` (X, count 0→max)
- **Marks:** `BarStackHorizontal` from `@visx/shape`
- **Axis:** `AxisLeft` (tester names, `tickFormat: v => v || 'Unassigned'`) + `AxisBottom` (counts)
- **Grid:** `GridColumns` (vertical lines only, matching `horizontal={false}`)
- **Hover:** `onMouseEnter` per bar segment sets `hoveredStatus`; passed as opacity modifier
- **Click:** `onClick` navigates to `/test-cases?testedBy=...&status=...`

---

### 4.3 ModuleBarChart — grouped vertical bar

- **Scale:** `scaleBand` (X, module names) + `scaleLinear` (Y, count) + inner `scaleBand` for group
- **Marks:** `BarGroup` from `@visx/shape`
- **Axis:** `AxisBottom` (module names, rotated −35°) + `AxisLeft` (counts)
- **Grid:** `GridRows`
- **Legend:** `LegendOrdinal` from `@visx/legend`
- **No click handlers** (matches current behaviour)

---

### 4.4 AppStackedBarChart — stacked % vertical bar

- **Scale:** `scaleBand` (X, app names) + `scaleLinear` (Y, 0–100, `tickFormat: v => v + '%'`)
- **Marks:** `BarStack` from `@visx/shape`
- **Axis:** `AxisBottom` + `AxisLeft`
- **Grid:** `GridRows`
- **Hover + click:** same as TesterBarChart pattern; click navigates to `/test-cases?applicationId=...&status=...` when `appId` is truthy

---

### 4.5 DonutChart — hollow pie

- **Marks:** `Pie` from `@visx/shape`; each arc rendered as `Arc` with `padAngle={0.02}`
- **Inner radius / outer radius:** unchanged from current recharts values, expressed as px
- **Active state:** `useState(null)` for `activeIndex`; hovered arc renders at slightly larger outer radius (+4px)
- **Center label:** SVG `<text>` showing total pass % (matches current)
- **Click:** `onClick` navigates to `/test-cases?status=...`
- **Legend:** `LegendOrdinal`

---

### 4.6 SummaryRow — inline progress bar

**Drop visx entirely.** Replace with a plain CSS flex bar:

```jsx
// Three divs, flex row, widths = pass%/fail%/pending% of parent
<div
  style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden' }}
>
  <div style={{ flex: pass, background: CHART_THEME.pass }} />
  <div style={{ flex: fail, background: CHART_THEME.fail }} />
  <div style={{ flex: pending, background: CHART_THEME.pending }} />
</div>
```

Zero dependency. No SVG. `isAnimationActive={false}` concern gone.

---

## 5. Dashboard Page Background

In `app/(app)/dashboard/page.js` or its wrapping layout, apply:

```jsx
// MUI Paper or Box wrapping the page content
sx={{ bgcolor: '#0a0a0c', minHeight: '100vh' }}
```

Each chart MUI `Card`:

```jsx
sx={{ bgcolor: '#111113', border: '1px solid rgba(255,255,255,0.08)' }}
```

---

## 6. Test Changes

- **`vitest.setup.js`:** remove `global.ResizeObserver = ...` stub
- **`SummaryRow.test.jsx`:** remove `.recharts-responsive-container` assertion; replace with a width/flex assertion on the CSS bar divs
- No new test cases needed (per project rule: ask before adding tests)

---

## 7. What This Is Not

- **Not** a change to any data-fetching logic, API routes, or DB queries
- **Not** a change to chart data shapes (same props in, different renderer out)
- **Not** a pixel-perfect recharts replica — charts will look better

---

## 8. Definition of Done

- [ ] All 4 dashboard charts render with visx + Carbon Teal theme
- [ ] `DynamicCharts.jsx` deleted; dashboard page imports charts directly (SSR-safe)
- [ ] `SummaryRow` uses plain CSS flex bar
- [ ] `recharts` removed from `package.json`
- [ ] `vitest.setup.js` ResizeObserver stub removed
- [ ] `npm run lint:fix` passes
- [ ] All existing tests pass
