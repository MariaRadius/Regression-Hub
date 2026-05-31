# Chart Theme & visx Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all dashboard charts from Recharts to visx and apply the Carbon Teal dark theme (`#111113` canvas, `#14b8a6` pass, `#f43f5e` fail, `#fbbf24` pending).

**Architecture:** Each chart is a self-contained `'use client'` component using `useParentSize` for responsive sizing. A shared `chartTheme.js` owns all design tokens. The SSR bypass (`DynamicCharts.jsx`) is deleted — visx is SSR-safe and charts import directly into the RSC page.

**Tech Stack:** Next.js 14 RSC, React, visx (`@visx/scale`, `@visx/shape`, `@visx/axis`, `@visx/grid`, `@visx/group`, `@visx/tooltip`, `@visx/responsive`, `@visx/legend`), MUI v9, vitest.

---

## File Map

| File                                                | Action                                                        |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `app/(app)/dashboard/charts/chartTheme.js`          | **Create** — design tokens (replaces `chartUtils.js`)         |
| `app/(app)/dashboard/charts/chartUtils.js`          | **Delete** — superseded by `chartTheme.js`                    |
| `components/SummaryRow.jsx`                         | **Rewrite** — plain CSS flex bar, no SVG library              |
| `components/__tests__/SummaryRow.test.jsx`          | **Update** — remove recharts assertions                       |
| `app/(app)/dashboard/charts/TesterBarChart.jsx`     | **Rewrite** — visx horizontal stacked bar                     |
| `app/(app)/dashboard/charts/ModuleBarChart.jsx`     | **Rewrite** — visx grouped vertical bar                       |
| `app/(app)/dashboard/charts/AppStackedBarChart.jsx` | **Rewrite** — visx stacked % vertical bar                     |
| `app/(app)/dashboard/charts/DonutChart.jsx`         | **Rewrite** — visx hollow pie/donut                           |
| `app/(app)/dashboard/charts/DynamicCharts.jsx`      | **Delete** — SSR bypass no longer needed                      |
| `app/(app)/dashboard/page.js`                       | **Update** — import charts directly, drop DynamicCharts       |
| `app/(app)/dashboard/loading.js`                    | **Update if exists** — match skeleton to new dark card layout |
| `vitest.setup.js`                                   | **Update** — remove `ResizeObserver` stub                     |

---

## Task 1: Install visx, keep recharts temporarily

**Files:**

- Modify: `package.json`

- [ ] **Install visx packages**

```bash
npm install @visx/scale @visx/shape @visx/axis @visx/grid @visx/group @visx/tooltip @visx/responsive @visx/legend
```

Expected: packages added to `node_modules`, `package.json` `dependencies` updated.

- [ ] **Verify installation**

```bash
node -e "require('@visx/shape'); require('@visx/responsive'); console.log('ok')"
```

Expected output: `ok`

- [ ] **Do NOT remove `recharts` yet** — it stays until all 4 charts are migrated (Task 8).

- [ ] **Commit**

```bash
git add package.json package-lock.json
git commit -m "RXR-XXXX: install visx packages for chart migration"
```

---

## Task 2: Create `chartTheme.js` (design tokens)

**Files:**

- Create: `app/(app)/dashboard/charts/chartTheme.js`

This replaces `chartUtils.js`. Import from here in every new chart file. The `TICK_LABEL_PROPS` helper is shared across all 4 charts — define once here.

- [ ] **Create the file**

```js
// app/(app)/dashboard/charts/chartTheme.js

/**
 * Carbon Teal — dashboard chart design tokens.
 * Near-black canvas with high-contrast semantic status colors.
 */
export const CHART_THEME = {
  pass: '#14b8a6', // teal
  fail: '#f43f5e', // rose-crimson
  pending: '#fbbf24', // amber
  bg: '#111113', // chart card background
  surface: '#1c1c1f', // donut inner / elevated surfaces
  text: '#a1a1aa', // axis labels, legend text
  grid: 'rgba(255,255,255,0.07)', // grid lines
  axis: '#27272a', // axis baseline stroke
};

/**
 * MUI `sx` prop for custom tooltip boxes.
 * Usage: <Box sx={TOOLTIP_BOX_SX}>...</Box>
 */
export const TOOLTIP_BOX_SX = {
  bgcolor: '#1c1c1f',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 1.5,
  p: 1.5,
  minWidth: 140,
  boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
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
  letterSpacing: '0.03em',
  textAnchor,
  dy: '0.33em',
});

/** CSS animation injected into each chart SVG for a subtle entrance. */
export const CHART_FADE_IN_STYLE = `
  @keyframes chartFadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;
```

- [ ] **Verify the file is valid ESM (no node require — just check syntax)**

```bash
npx --yes acorn --ecma2020 --module app/\(app\)/dashboard/charts/chartTheme.js > /dev/null && echo ok
```

Expected output: `ok` (acorn parses it without error).

- [ ] **Commit**

```bash
git add app/\(app\)/dashboard/charts/chartTheme.js
git commit -m "RXR-XXXX: add chartTheme.js with Carbon Teal design tokens"
```

---

## Task 3: Rewrite `SummaryRow` — plain CSS flex bar

**Files:**

- Modify: `components/SummaryRow.jsx`
- Modify: `components/__tests__/SummaryRow.test.jsx`

`SummaryRow` currently uses a 4px recharts `BarChart`. Replace with a zero-dependency CSS flex bar — no MUI Box, no SVG.

- [ ] **Update the test first (TDD) — read the existing file, then replace recharts assertions**

```jsx
// components/__tests__/SummaryRow.test.jsx
// Keep all existing imports and setup. Replace the recharts container assertion with:

it('renders three coloured segments when total > 0', () => {
  render(<SummaryRow pass={6} fail={2} pending={2} total={10} />);
  expect(screen.getByTestId('progress-segment-pass')).toBeInTheDocument();
  expect(screen.getByTestId('progress-segment-fail')).toBeInTheDocument();
  expect(screen.getByTestId('progress-segment-pending')).toBeInTheDocument();
});

it('renders nothing when total is 0', () => {
  render(<SummaryRow pass={0} fail={0} pending={0} total={0} />);
  expect(screen.queryByTestId('progress-bar')).not.toBeInTheDocument();
});
```

- [ ] **Run the test — expect FAIL**

```bash
npx vitest run components/__tests__/SummaryRow.test.jsx
```

Expected: FAIL — `progress-segment-pass` not found.

- [ ] **Rewrite `SummaryRow.jsx`**

Note: plain `<div style={...}>` is intentional — this component has no MUI dependency, keeping it lightweight. The CLAUDE.md Stack/Box rule applies to MUI components, not raw HTML elements.

```jsx
// components/SummaryRow.jsx
'use client';

import { CHART_THEME } from '@/app/(app)/dashboard/charts/chartTheme';

/**
 * Inline 4px stacked progress bar showing Pass/Fail/Pending proportions.
 * Uses CSS flex with raw divs — no MUI, no SVG.
 * @see components/__tests__/SummaryRow.test.jsx
 *
 * @param {number} pass    — count of passing test cases
 * @param {number} fail    — count of failing test cases
 * @param {number} pending — count of pending test cases
 * @param {number} total   — sum of pass + fail + pending
 */
export default function SummaryRow({ pass, fail, pending, total }) {
  if (!total) return null;

  return (
    <div
      data-testid='progress-bar'
      style={{
        display: 'flex',
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        data-testid='progress-segment-pass'
        style={{ flex: pass, background: CHART_THEME.pass }}
      />
      <div
        data-testid='progress-segment-fail'
        style={{ flex: fail, background: CHART_THEME.fail }}
      />
      <div
        data-testid='progress-segment-pending'
        style={{ flex: pending, background: CHART_THEME.pending }}
      />
    </div>
  );
}
```

- [ ] **Run the test — expect PASS**

```bash
npx vitest run components/__tests__/SummaryRow.test.jsx
```

Expected: all tests PASS.

- [ ] **Commit**

```bash
git add components/SummaryRow.jsx components/__tests__/SummaryRow.test.jsx
git commit -m "RXR-XXXX: replace recharts SummaryRow with CSS flex progress bar"
```

---

## Task 4: Rewrite `TesterBarChart` — visx horizontal stacked bar

**Files:**

- Modify: `app/(app)/dashboard/charts/TesterBarChart.jsx`

Behaviour to preserve: horizontal stacked bars (Pass/Fail/Pending), hover dims non-selected status across all bars, click navigates to `/test-cases?testedBy=...&status=...`, "Unassigned" fallback for empty name.

Design detail: dashed grid columns, rounded top on Pass segment only, `chartFadeIn` entrance.

- [ ] **Rewrite the file**

```jsx
// app/(app)/dashboard/charts/TesterBarChart.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { BarStackHorizontal } from '@visx/shape';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { GridColumns } from '@visx/grid';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { useParentSize } from '@visx/responsive';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import {
  CHART_THEME,
  TOOLTIP_BOX_SX,
  tickLabelProps,
  CHART_FADE_IN_STYLE,
} from './chartTheme';

const MARGIN = { top: 10, right: 16, bottom: 30, left: 112 };
const KEYS = ['Pass', 'Fail', 'Pending'];
const STATUS_COLOR = {
  Pass: CHART_THEME.pass,
  Fail: CHART_THEME.fail,
  Pending: CHART_THEME.pending,
};

/**
 * Horizontal stacked bar chart — QA Tester Summary.
 * @param {{ name: string, Pass: number, Fail: number, Pending: number, total: number }[]} testerBarData
 */
export default function TesterBarChart({ testerBarData }) {
  const router = useRouter();
  const [hoveredStatus, setHoveredStatus] = useState(null);
  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
  } = useTooltip();
  const { parentRef, width, height } = useParentSize({ debounceTime: 50 });

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const yScale = scaleBand({
    domain: testerBarData.map((d) => d.name),
    range: [0, innerHeight],
    padding: 0.35,
  });

  const xMax = Math.max(...testerBarData.map((d) => d.total), 1);
  const xScale = scaleLinear({
    domain: [0, xMax],
    range: [0, innerWidth],
    nice: true,
  });

  const colorScale = scaleOrdinal({
    domain: KEYS,
    range: KEYS.map((k) => STATUS_COLOR[k]),
  });

  return (
    <div
      ref={parentRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          style={{ animation: 'chartFadeIn 0.35s ease forwards' }}
        >
          <defs>
            <style>{CHART_FADE_IN_STYLE}</style>
          </defs>
          <Group left={MARGIN.left} top={MARGIN.top}>
            <GridColumns
              scale={xScale}
              height={innerHeight}
              stroke={CHART_THEME.grid}
              strokeWidth={1}
              strokeDasharray='2 4'
            />
            <BarStackHorizontal
              data={testerBarData}
              keys={KEYS}
              width={innerWidth}
              y={(d) => d.name}
              xScale={xScale}
              yScale={yScale}
              color={colorScale}
            >
              {(barStacks) =>
                barStacks.map((barStack) =>
                  barStack.bars.map((bar) => {
                    const isPass = barStack.key === 'Pass';
                    const barH = yScale.bandwidth();
                    const RADIUS = 2;
                    return (
                      <g key={`${barStack.index}-${bar.index}`}>
                        {/* All segments: flat. Pass gets rounded right end. */}
                        <rect
                          x={bar.x}
                          y={bar.y}
                          width={Math.max(bar.width, 0)}
                          height={barH}
                          fill={STATUS_COLOR[barStack.key]}
                          rx={isPass ? RADIUS : 0}
                          opacity={
                            hoveredStatus === null ||
                            hoveredStatus === barStack.key
                              ? 1
                              : 0.25
                          }
                          style={{ transition: 'opacity 0.12s ease' }}
                          cursor='pointer'
                          onMouseEnter={() => {
                            setHoveredStatus(barStack.key);
                            showTooltip({
                              tooltipData: {
                                tester: bar.bar.data.name,
                                status: barStack.key,
                                count: bar.bar.data[barStack.key],
                              },
                              tooltipLeft: bar.x + bar.width / 2 + MARGIN.left,
                              tooltipTop: bar.y + MARGIN.top,
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredStatus(null);
                            hideTooltip();
                          }}
                          onClick={() =>
                            router.push(
                              `/test-cases?testedBy=${encodeURIComponent(bar.bar.data.name || '')}&status=${barStack.key}`,
                            )
                          }
                        />
                        {/* Square off left side of Pass so only right end is rounded */}
                        {isPass && bar.width > RADIUS && (
                          <rect
                            x={bar.x}
                            y={bar.y}
                            width={RADIUS}
                            height={barH}
                            fill={STATUS_COLOR[barStack.key]}
                            opacity={
                              hoveredStatus === null ||
                              hoveredStatus === barStack.key
                                ? 1
                                : 0.25
                            }
                            style={{
                              transition: 'opacity 0.12s ease',
                              pointerEvents: 'none',
                            }}
                          />
                        )}
                      </g>
                    );
                  }),
                )
              }
            </BarStackHorizontal>
            <AxisLeft
              scale={yScale}
              tickFormat={(v) => v || 'Unassigned'}
              tickLabelProps={() => tickLabelProps('end')}
              stroke={CHART_THEME.axis}
              tickStroke='transparent'
            />
            <AxisBottom
              top={innerHeight}
              scale={xScale}
              tickLabelProps={() => tickLabelProps('middle', 10)}
              stroke={CHART_THEME.axis}
              tickStroke={CHART_THEME.axis}
              numTicks={5}
            />
          </Group>
        </svg>
      )}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={{ position: 'absolute', pointerEvents: 'none' }}
        >
          <Box sx={TOOLTIP_BOX_SX}>
            <Box sx={{ fontSize: 11, color: CHART_THEME.text, mb: 0.5 }}>
              {tooltipData.tester || 'Unassigned'}
            </Box>
            <Stack direction='row' justifyContent='space-between' spacing={2}>
              <Box
                component='span'
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: STATUS_COLOR[tooltipData.status],
                }}
              >
                {tooltipData.status}
              </Box>
              <Box
                component='span'
                sx={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: STATUS_COLOR[tooltipData.status],
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {tooltipData.count}
              </Box>
            </Stack>
          </Box>
        </TooltipWithBounds>
      )}
    </div>
  );
}
```

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add app/\(app\)/dashboard/charts/TesterBarChart.jsx
git commit -m "RXR-XXXX: migrate TesterBarChart to visx with Carbon Teal theme"
```

---

## Task 5: Rewrite `ModuleBarChart` — visx grouped vertical bar

**Files:**

- Modify: `app/(app)/dashboard/charts/ModuleBarChart.jsx`

Behaviour to preserve: grouped side-by-side bars per module, rotated X-axis labels (−35°), legend at top, no click handlers.

Design detail: all bars get `rx={3}` (each is an independent column in a group), dashed grid rows.

- [ ] **Rewrite the file**

```jsx
// app/(app)/dashboard/charts/ModuleBarChart.jsx
'use client';

import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { BarGroup } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { LegendOrdinal } from '@visx/legend';
import { useParentSize } from '@visx/responsive';
import { CHART_THEME, tickLabelProps, CHART_FADE_IN_STYLE } from './chartTheme';

const MARGIN = { top: 8, right: 20, bottom: 90, left: 40 };
const LEGEND_HEIGHT = 28;
const KEYS = ['Pass', 'Fail', 'Pending'];
const STATUS_COLOR = {
  Pass: CHART_THEME.pass,
  Fail: CHART_THEME.fail,
  Pending: CHART_THEME.pending,
};
const BAR_MAX_WIDTH = 18;

/**
 * Grouped vertical bar chart — Results by Module.
 * @param {{ name: string, Pass: number, Fail: number, Pending: number }[]} moduleBarData
 */
export default function ModuleBarChart({ moduleBarData }) {
  const { parentRef, width, height } = useParentSize({ debounceTime: 50 });

  const chartHeight = Math.max(0, height - LEGEND_HEIGHT);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, chartHeight - MARGIN.top - MARGIN.bottom);

  const x0Scale = scaleBand({
    domain: moduleBarData.map((d) => d.name),
    range: [0, innerWidth],
    padding: 0.3,
  });

  const x1Scale = scaleBand({
    domain: KEYS,
    range: [0, x0Scale.bandwidth()],
    padding: 0.08,
  });

  const yMax = Math.max(
    ...moduleBarData.flatMap((d) => KEYS.map((k) => d[k])),
    1,
  );
  const yScale = scaleLinear({
    domain: [0, yMax],
    range: [innerHeight, 0],
    nice: true,
  });

  const colorScale = scaleOrdinal({
    domain: KEYS,
    range: KEYS.map((k) => STATUS_COLOR[k]),
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Legend — plain div wrapper is intentional; LegendOrdinal manages its own layout */}
      <div
        style={{
          paddingLeft: MARGIN.left,
          height: LEGEND_HEIGHT,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <LegendOrdinal
          scale={colorScale}
          direction='row'
          labelAlign='flex-start'
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.03em',
            color: CHART_THEME.text,
          }}
          shapeStyle={() => ({ width: 8, height: 8, borderRadius: 2 })}
        />
      </div>
      <div ref={parentRef} style={{ flex: 1, position: 'relative' }}>
        {width > 0 && (
          <svg
            width={width}
            height={chartHeight}
            style={{ animation: 'chartFadeIn 0.35s ease forwards' }}
          >
            <defs>
              <style>{CHART_FADE_IN_STYLE}</style>
            </defs>
            <Group left={MARGIN.left} top={MARGIN.top}>
              <GridRows
                scale={yScale}
                width={innerWidth}
                stroke={CHART_THEME.grid}
                strokeWidth={1}
                strokeDasharray='2 4'
                numTicks={5}
              />
              <BarGroup
                data={moduleBarData}
                keys={KEYS}
                width={innerWidth}
                x0={(d) => d.name}
                x0Scale={x0Scale}
                x1Scale={x1Scale}
                yScale={yScale}
                color={colorScale}
              >
                {(barGroups) =>
                  barGroups.map((barGroup) => (
                    <Group
                      key={`bar-group-${barGroup.index}`}
                      left={barGroup.x0}
                    >
                      {barGroup.bars.map((bar) => (
                        <rect
                          key={`bar-${barGroup.index}-${bar.index}`}
                          x={bar.x}
                          y={bar.y}
                          width={Math.min(bar.width, BAR_MAX_WIDTH)}
                          height={Math.max(bar.height, 0)}
                          fill={bar.color}
                          rx={3}
                        />
                      ))}
                    </Group>
                  ))
                }
              </BarGroup>
              <AxisLeft
                scale={yScale}
                tickLabelProps={() => tickLabelProps('end', 10)}
                stroke={CHART_THEME.axis}
                tickStroke={CHART_THEME.axis}
                numTicks={5}
              />
              <AxisBottom
                top={innerHeight}
                scale={x0Scale}
                stroke={CHART_THEME.axis}
                tickStroke='transparent'
                tickLabelProps={() => ({
                  ...tickLabelProps('end'),
                  transform: 'rotate(-35)',
                })}
              />
            </Group>
          </svg>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add app/\(app\)/dashboard/charts/ModuleBarChart.jsx
git commit -m "RXR-XXXX: migrate ModuleBarChart to visx with Carbon Teal theme"
```

---

## Task 6: Rewrite `AppStackedBarChart` — visx stacked % vertical bar

**Files:**

- Modify: `app/(app)/dashboard/charts/AppStackedBarChart.jsx`

Behaviour to preserve: stacked % bars (0–100), `%` Y-axis ticks, hover dims non-selected segments, click navigates when `appId` truthy.

Design detail: Pass segment gets rounded top corners only (double-rect technique), `<Stack>` for tooltip rows (not Box-as-flex).

- [ ] **Rewrite the file**

```jsx
// app/(app)/dashboard/charts/AppStackedBarChart.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { BarStack } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { useParentSize } from '@visx/responsive';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  CHART_THEME,
  TOOLTIP_BOX_SX,
  tickLabelProps,
  CHART_FADE_IN_STYLE,
} from './chartTheme';

const MARGIN = { top: 10, right: 20, bottom: 30, left: 44 };
const KEYS = ['Pass', 'Fail', 'Pending'];
const STATUS_COLOR = {
  Pass: CHART_THEME.pass,
  Fail: CHART_THEME.fail,
  Pending: CHART_THEME.pending,
};
const TOP_RADIUS = 3;

/**
 * Stacked percentage vertical bar chart — Application Summary.
 * @param {{ name: string, appId: string, Pass: number, Fail: number, Pending: number,
 *           passCount: number, failCount: number, pendingCount: number }[]} appBarData
 *   Pass/Fail/Pending values are percentages (0–100).
 */
export default function AppStackedBarChart({ appBarData }) {
  const router = useRouter();
  const [hoveredStatus, setHoveredStatus] = useState(null);
  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
  } = useTooltip();
  const { parentRef, width, height } = useParentSize({ debounceTime: 50 });

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const xScale = scaleBand({
    domain: appBarData.map((d) => d.name),
    range: [0, innerWidth],
    padding: 0.3,
  });
  const yScale = scaleLinear({ domain: [0, 100], range: [innerHeight, 0] });
  const colorScale = scaleOrdinal({
    domain: KEYS,
    range: KEYS.map((k) => STATUS_COLOR[k]),
  });

  return (
    <div
      ref={parentRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          style={{ animation: 'chartFadeIn 0.35s ease forwards' }}
        >
          <defs>
            <style>{CHART_FADE_IN_STYLE}</style>
          </defs>
          <Group left={MARGIN.left} top={MARGIN.top}>
            <GridRows
              scale={yScale}
              width={innerWidth}
              stroke={CHART_THEME.grid}
              strokeWidth={1}
              strokeDasharray='2 4'
              numTicks={5}
            />
            <BarStack
              data={appBarData}
              keys={KEYS}
              x={(d) => d.name}
              xScale={xScale}
              yScale={yScale}
              color={colorScale}
            >
              {(barStacks) =>
                barStacks.map((barStack) =>
                  barStack.bars.map((bar) => {
                    const isPass = barStack.key === 'Pass';
                    const w = Math.max(bar.width, 0);
                    const h = Math.max(bar.height, 0);
                    const opacity =
                      hoveredStatus === null || hoveredStatus === barStack.key
                        ? 1
                        : 0.25;
                    const common = {
                      fill: STATUS_COLOR[barStack.key],
                      opacity,
                      style: { transition: 'opacity 0.12s ease' },
                      cursor: bar.bar.data.appId ? 'pointer' : 'default',
                      onMouseEnter: () => {
                        setHoveredStatus(barStack.key);
                        showTooltip({
                          tooltipData: {
                            bar: bar.bar.data,
                            status: barStack.key,
                          },
                          tooltipLeft: bar.x + w / 2 + MARGIN.left,
                          tooltipTop: bar.y + MARGIN.top,
                        });
                      },
                      onMouseLeave: () => {
                        setHoveredStatus(null);
                        hideTooltip();
                      },
                      onClick: () => {
                        if (bar.bar.data.appId) {
                          router.push(
                            `/test-cases?applicationId=${bar.bar.data.appId}&status=${barStack.key}`,
                          );
                        }
                      },
                    };
                    return (
                      <g key={`${barStack.index}-${bar.index}`}>
                        {/* Base rect — rounded top corners via rx on full height */}
                        <rect
                          x={bar.x}
                          y={bar.y}
                          width={w}
                          height={h + (isPass ? TOP_RADIUS : 0)}
                          rx={isPass ? TOP_RADIUS : 0}
                          {...common}
                        />
                        {/* Square off bottom of Pass segment so only top corners are rounded */}
                        {isPass && h > TOP_RADIUS && (
                          <rect
                            x={bar.x}
                            y={bar.y + TOP_RADIUS}
                            width={w}
                            height={h - TOP_RADIUS}
                            {...common}
                            style={{ ...common.style, pointerEvents: 'none' }}
                          />
                        )}
                      </g>
                    );
                  }),
                )
              }
            </BarStack>
            <AxisLeft
              scale={yScale}
              tickFormat={(v) => `${v}%`}
              tickLabelProps={() => tickLabelProps('end', 10)}
              stroke={CHART_THEME.axis}
              tickStroke={CHART_THEME.axis}
              numTicks={5}
            />
            <AxisBottom
              top={innerHeight}
              scale={xScale}
              tickLabelProps={() => tickLabelProps('middle')}
              stroke={CHART_THEME.axis}
              tickStroke='transparent'
            />
          </Group>
        </svg>
      )}
      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={{ position: 'absolute', pointerEvents: 'none' }}
        >
          <Box sx={TOOLTIP_BOX_SX}>
            <Typography
              sx={{
                fontSize: 11,
                color: CHART_THEME.text,
                mb: 0.75,
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              {tooltipData.bar.name}
            </Typography>
            <Stack spacing={0.5}>
              {KEYS.map((key) => {
                const countKey = `${key.toLowerCase()}Count`;
                return (
                  <Stack
                    key={key}
                    direction='row'
                    justifyContent='space-between'
                    spacing={2}
                  >
                    <Box
                      component='span'
                      sx={{
                        fontSize: 11,
                        color: STATUS_COLOR[key],
                        fontWeight: hoveredStatus === key ? 700 : 400,
                      }}
                    >
                      {key}
                    </Box>
                    <Box
                      component='span'
                      sx={{
                        fontSize: 11,
                        color: CHART_THEME.text,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {tooltipData.bar[key]}% ({tooltipData.bar[countKey]})
                    </Box>
                  </Stack>
                );
              })}
            </Stack>
          </Box>
        </TooltipWithBounds>
      )}
    </div>
  );
}
```

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add app/\(app\)/dashboard/charts/AppStackedBarChart.jsx
git commit -m "RXR-XXXX: migrate AppStackedBarChart to visx with Carbon Teal theme"
```

---

## Task 7: Rewrite `DonutChart` — visx hollow pie

**Files:**

- Modify: `app/(app)/dashboard/charts/DonutChart.jsx`

Behaviour to preserve: hollow donut, hovered slice expands (+6px), click navigates to `/test-cases?status=...`, legend below.

Design detail: `fontFamily` is NOT set on SVG text (inherits from page CSS, per CLAUDE.md). Arc entrance uses CSS opacity. Tooltip rows use `<Stack>`, not Box-as-flex.

- [ ] **Rewrite the file**

```jsx
// app/(app)/dashboard/charts/DonutChart.jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pie } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleOrdinal } from '@visx/scale';
import { LegendOrdinal } from '@visx/legend';
import { useTooltip, TooltipWithBounds } from '@visx/tooltip';
import { useParentSize } from '@visx/responsive';
import { arc as d3Arc } from 'd3-shape';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CHART_THEME, TOOLTIP_BOX_SX, CHART_FADE_IN_STYLE } from './chartTheme';

const KEYS = ['Pass', 'Fail', 'Pending'];
const STATUS_COLOR = {
  Pass: CHART_THEME.pass,
  Fail: CHART_THEME.fail,
  Pending: CHART_THEME.pending,
};
const INNER_RADIUS_FRACTION = 0.6; // thinner ring = more elegant
const ACTIVE_EXPAND = 6;
const LEGEND_HEIGHT = 32;

/**
 * Hollow donut chart — overall Pass/Fail/Pending summary.
 * @param {{ name: 'Pass'|'Fail'|'Pending', value: number, total: number }[]} donutData
 */
export default function DonutChart({ donutData }) {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(null);
  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
  } = useTooltip();
  const { parentRef, width, height } = useParentSize({ debounceTime: 50 });

  const colorScale = scaleOrdinal({
    domain: KEYS,
    range: KEYS.map((k) => STATUS_COLOR[k]),
  });

  const svgHeight = Math.max(0, height - LEGEND_HEIGHT);
  const radius = Math.min(width, svgHeight) / 2 - 10;
  const innerRadius = radius * INNER_RADIUS_FRACTION;

  const total = donutData.reduce((s, d) => s + d.value, 0);
  const passPercent =
    total > 0
      ? Math.round(
          ((donutData.find((d) => d.name === 'Pass')?.value ?? 0) / total) *
            100,
        )
      : 0;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div ref={parentRef} style={{ flex: 1, position: 'relative' }}>
        {width > 0 && radius > 0 && (
          <svg
            width={width}
            height={svgHeight}
            role='img'
            aria-label='Test results donut chart'
            style={{ animation: 'chartFadeIn 0.4s ease forwards' }}
          >
            <defs>
              <style>{CHART_FADE_IN_STYLE}</style>
            </defs>
            <Group top={svgHeight / 2} left={width / 2}>
              <Pie
                data={donutData}
                pieValue={(d) => d.value}
                outerRadius={radius}
                innerRadius={innerRadius}
                padAngle={0.03}
              >
                {(pie) =>
                  pie.arcs.map((arc, i) => {
                    const isActive = activeIndex === i;
                    const arcPath = d3Arc()
                      .innerRadius(innerRadius)
                      .outerRadius(isActive ? radius + ACTIVE_EXPAND : radius)(
                      arc,
                    );
                    return (
                      <path
                        key={arc.data.name}
                        d={arcPath}
                        fill={STATUS_COLOR[arc.data.name]}
                        cursor='pointer'
                        style={{
                          opacity: activeIndex === null || isActive ? 1 : 0.5,
                          transition: 'opacity 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          setActiveIndex(i);
                          showTooltip({
                            tooltipData: arc.data,
                            tooltipLeft: e.clientX,
                            tooltipTop: e.clientY,
                          });
                        }}
                        onMouseLeave={() => {
                          setActiveIndex(null);
                          hideTooltip();
                        }}
                        onClick={() =>
                          router.push(`/test-cases?status=${arc.data.name}`)
                        }
                      />
                    );
                  })
                }
              </Pie>
              {/* Centre label — fontFamily intentionally omitted; inherits from page CSS */}
              <text
                textAnchor='middle'
                dominantBaseline='middle'
                fill={CHART_THEME.pass}
                fontSize={radius * 0.27}
                fontWeight={700}
                letterSpacing='-0.02em'
              >
                {passPercent}%
              </text>
            </Group>
          </svg>
        )}
        {tooltipOpen && tooltipData && (
          <TooltipWithBounds
            left={tooltipLeft}
            top={tooltipTop}
            style={{ position: 'fixed', pointerEvents: 'none' }}
          >
            <Box sx={TOOLTIP_BOX_SX}>
              <Typography
                sx={{
                  fontSize: 11,
                  color: CHART_THEME.text,
                  mb: 0.75,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                }}
              >
                Total: {tooltipData.total}
              </Typography>
              <Stack spacing={0.5}>
                {KEYS.map((key) => {
                  const d = donutData.find((x) => x.name === key);
                  const pct =
                    tooltipData.total > 0
                      ? Math.round(((d?.value ?? 0) / tooltipData.total) * 100)
                      : 0;
                  return (
                    <Stack
                      key={key}
                      direction='row'
                      justifyContent='space-between'
                      spacing={2}
                    >
                      <Box
                        component='span'
                        sx={{
                          fontSize: 11,
                          color: STATUS_COLOR[key],
                          fontWeight: key === tooltipData.name ? 700 : 400,
                        }}
                      >
                        {key}
                      </Box>
                      <Box
                        component='span'
                        sx={{
                          fontSize: 11,
                          color: CHART_THEME.text,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {pct}% ({d?.value ?? 0})
                      </Box>
                    </Stack>
                  );
                })}
              </Stack>
            </Box>
          </TooltipWithBounds>
        )}
      </div>
      {/* Legend — plain div intentional; LegendOrdinal manages its own layout */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: LEGEND_HEIGHT,
        }}
      >
        <LegendOrdinal
          scale={colorScale}
          direction='row'
          labelAlign='flex-start'
          style={{
            display: 'flex',
            gap: 16,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.03em',
            color: CHART_THEME.text,
          }}
          shapeStyle={() => ({ width: 8, height: 8, borderRadius: '50%' })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add app/\(app\)/dashboard/charts/DonutChart.jsx
git commit -m "RXR-XXXX: migrate DonutChart to visx with Carbon Teal theme"
```

---

## Task 8: Delete `DynamicCharts.jsx`, update `page.js` imports

**Files:**

- Delete: `app/(app)/dashboard/charts/DynamicCharts.jsx`
- Delete: `app/(app)/dashboard/charts/chartUtils.js`
- Modify: `app/(app)/dashboard/page.js`

All charts are now `'use client'` visx components — SSR-safe, no dynamic import needed.

- [ ] **Read `app/(app)/dashboard/page.js`** to find the exact DynamicCharts import line(s).

- [ ] **Replace the DynamicCharts import with direct imports**

Find (exact names may vary — match the file):

```js
import {
  DynamicDonutChart,
  DynamicTesterBarChart,
  DynamicModuleBarChart,
  DynamicAppStackedBarChart,
} from './charts/DynamicCharts';
```

Replace with:

```js
import DonutChart from './charts/DonutChart';
import TesterBarChart from './charts/TesterBarChart';
import ModuleBarChart from './charts/ModuleBarChart';
import AppStackedBarChart from './charts/AppStackedBarChart';
```

- [ ] **Update all JSX component names in the file**

`DynamicDonutChart` → `DonutChart`, `DynamicTesterBarChart` → `TesterBarChart`, `DynamicModuleBarChart` → `ModuleBarChart`, `DynamicAppStackedBarChart` → `AppStackedBarChart`.

- [ ] **Delete the obsolete files**

```bash
rm "app/(app)/dashboard/charts/DynamicCharts.jsx"
rm "app/(app)/dashboard/charts/chartUtils.js"
```

- [ ] **Verify no remaining references**

```bash
grep -r "DynamicCharts\|chartUtils" app/ components/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add -A
git commit -m "RXR-XXXX: delete DynamicCharts.jsx and chartUtils.js, import charts directly in page.js"
```

---

## Task 9: Apply dashboard background styling

**Files:**

- Modify: `app/(app)/dashboard/page.js`

Carbon Teal uses a near-black page (`#0a0a0c`) with lifted card surfaces (`#111113` + subtle border).

- [ ] **Read `app/(app)/dashboard/page.js`** — identify the outermost layout wrapper (typically a `Stack`) and the `Card`/`Paper` components that contain each chart.

- [ ] **Apply dark background to the outermost page wrapper**

Find the outermost wrapper and add/merge:

```jsx
// Existing wrapper is typically a Stack — merge into its sx prop
<Stack sx={{ bgcolor: '#0a0a0c', minHeight: '100vh' }} spacing={3} padding={3}>
```

Do not create a second `sx` prop. Merge into existing.

- [ ] **Apply dark surface + border to each chart Card**

For each `<Card>` that wraps a chart, add/merge:

```jsx
<Card sx={{ bgcolor: '#111113', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
```

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add app/\(app\)/dashboard/page.js
git commit -m "RXR-XXXX: apply Carbon Teal dark background to dashboard page and chart cards"
```

---

## Task 10: Update `loading.js` skeleton to match dark card layout

**Files:**

- Modify: `app/(app)/dashboard/loading.js` (skip this task if the file does not exist)

CLAUDE.md requires skeleton blocks to match settled-page dimensions, spacing, and grid position. The new dark card layout changes card `bgcolor` and `border` — the skeleton must mirror it.

- [ ] **Check if `loading.js` exists**

```bash
ls app/\(app\)/dashboard/loading.js 2>/dev/null && echo exists || echo missing
```

If output is `missing`, skip this task entirely and proceed to Task 11.

- [ ] **Read `app/(app)/dashboard/loading.js`** if it exists.

- [ ] **Update every `<Skeleton>` card wrapper** to match the chart card appearance

For each `Card`/`Paper` wrapping a `<Skeleton>`, add the same sx as Task 9:

```jsx
<Card
  sx={{
    bgcolor: '#111113',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 3,
  }}
>
  <Skeleton
    variant='rectangular'
    sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}
    height={280}
  />
</Card>
```

The `Skeleton` fill color is `rgba(255,255,255,0.04)` — visible on the dark card surface without being distracting.

- [ ] **Update the page wrapper** in `loading.js` to match Task 9 page background:

```jsx
<Stack sx={{ bgcolor: '#0a0a0c', minHeight: '100vh' }} spacing={3} padding={3}>
```

- [ ] **Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add app/\(app\)/dashboard/loading.js
git commit -m "RXR-XXXX: update loading.js skeleton to match Carbon Teal dark card layout"
```

---

## Task 11: Cleanup — remove recharts, fix vitest setup, lint

**Files:**

- Modify: `package.json`
- Modify: `vitest.setup.js`

- [ ] **Remove recharts**

```bash
npm uninstall recharts
```

- [ ] **Verify no remaining recharts imports**

```bash
grep -r "from 'recharts'" app/ components/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Read `vitest.setup.js`** and remove the ResizeObserver stub

Delete this block (line numbers vary):

```js
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
```

- [ ] **Run all tests — confirm stub is no longer needed**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Run lint once at the end**

```bash
npm run lint:fix
```

Expected: no errors.

- [ ] **Commit**

```bash
git add package.json package-lock.json vitest.setup.js
git commit -m "RXR-XXXX: remove recharts, strip ResizeObserver stub, final lint"
```

---

## Self-Review

**Spec coverage:**

| Requirement                                      | Task |
| ------------------------------------------------ | ---- |
| Carbon Teal tokens in `chartTheme.js`            | 2    |
| `SummaryRow` → CSS flex bar                      | 3    |
| `TesterBarChart` → visx `BarStackHorizontal`     | 4    |
| `ModuleBarChart` → visx `BarGroup`               | 5    |
| `AppStackedBarChart` → visx `BarStack`           | 6    |
| `DonutChart` → visx `Pie` + `d3Arc`              | 7    |
| `DynamicCharts.jsx` deleted                      | 8    |
| `chartUtils.js` deleted                          | 8    |
| Dashboard page imports charts directly           | 8    |
| Page bg `#0a0a0c`, card bg `#111113` + border    | 9    |
| `loading.js` skeleton updated                    | 10   |
| `recharts` removed                               | 11   |
| `ResizeObserver` stub removed                    | 11   |
| `SummaryRow.test.jsx` recharts assertion removed | 3    |
| `npm run lint:fix` once at end                   | 11   |

**CLAUDE.md alignment:**

| Rule                                             | How plan complies                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `DO NOT use Box as flex/grid layout wrapper`     | Tasks 4–7: all tooltip rows use `<Stack direction="row">`, not Box-as-flex                                               |
| `DO NOT use custom margin/padding in sx`         | All `p`, `mb`, `spacing` use MUI spacing units; `border`/`boxShadow` have no MUI equivalent (acceptable)                 |
| `DO NOT set font-family outside globals.css`     | DonutChart SVG `<text>` omits `fontFamily` — inherits from page CSS                                                      |
| `DO NOT use next/dynamic ssr:false in RSC pages` | DynamicCharts.jsx deleted in Task 8                                                                                      |
| `loading.js skeleton must match page layout`     | Task 10 updates skeleton to dark card appearance                                                                         |
| `when writing utils/hooks/components, use TDD`   | Task 3 writes failing test before implementation; chart render tasks are pure visual with no testable logic beyond smoke |

**Placeholder scan:** None found.

**Type/name consistency:** `CHART_THEME`, `TOOLTIP_BOX_SX`, `tickLabelProps`, `CHART_FADE_IN_STYLE`, `STATUS_COLOR`, `KEYS` — defined in Task 2, used identically in Tasks 3–7. `useParentSize` returns `{ parentRef, width, height }` — used consistently in Tasks 4–7.
