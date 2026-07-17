# Failures by Module Pie Chart — Design

**Date:** 2026-07-03
**Ticket:** RXR-11849 (no ticket provided; default prefix)

## Problem

The dashboard's existing donut (`DonutChart`) plots Pass / Fail / Pending on one
circle. When pending dwarfs the other statuses (e.g. 2,084 pending vs. 31 failed,
46 passed), the fail wedge collapses to an unreadable sliver — you cannot tell how
failures are distributed. QA needs to see *which modules* the failures land in.

## Solution

Add a second, failure-only pie — **"Failures by Module"** — where each slice is one
module's failed-test count. This isolates failures from the pending mass so every
failing module is a legible slice.

## Approach

A new focused client component, `FailByModuleChart`, rather than generalizing the
existing `DonutChart`. The status donut is tightly bound to status semantics
(hardcoded Pass/Fail/Pending keys, the cross-chart `ChartHoverContext` linking,
`?status=` navigation, the center pass-% label); making it generic would risk the
working chart for no real reuse gain. The new component instead reuses the genuinely
shared pieces: the already-exported `buildSideLabelLayout` helper, `chartTheme`, and
the visx `Pie`/tooltip primitives.

## Components & Data Flow

- **Transform** `buildFailByModuleData(moduleGroups)` in
  `lib/db/dashboardTransforms.js`:
  - Filters `moduleGroups` entries to `failed > 0`.
  - Sorts by `failed` desc (tie-break by name asc for determinism).
  - Keeps the **top 8** modules; rolls any remaining modules' failures into a single
    `{ name: 'Other', value: <sum>, moduleId: null }` slice (omitted if the sum is 0).
  - Returns `{ name, moduleId, value }[]`. Empty array when there are no failures.
  - No DB change — `moduleGroups` is already fetched by `getDashboardData`.

- **Component** `app/(app)/dashboard/charts/FailByModuleChart.jsx` (`'use client'`):
  - Donut with one slice per failing module, using a **distinct categorical color
    palette** (module identity is not a status, so it must not reuse the
    red/green/amber status colors).
  - Side labels via the shared `buildSideLabelLayout` helper; label text is
    `name` + fail count.
  - Center label shows **total failures**.
  - Tooltip: module name, fail count, and % of all failures.
  - Clicking a module slice navigates to `/test-cases?status=Fail&moduleId=<id>`.
    The `Other` slice (no `moduleId`) is not clickable.
  - No `ChartHoverContext` participation — module slices have no status counterpart
    in the other charts to link to.

- **`page.js`**: compute `buildFailByModuleData(moduleGroups)` and render inside a new
  `Panel title='Failures by Module'`, placed as a half-width panel
  (`size={{ xs: 12, md: 6 }}`) directly below the three-chart top row and above
  "Results by Module", pairing with the "Top Failing Modules" insight.

## Empty State

When `buildFailByModuleData` returns `[]` (zero failures), the panel renders the
standard composed empty state (MUI icon + bold title Typography + subtitle
Typography), not a blank pie. No "go back" button is needed since it lives inline on
the dashboard.

## Testing

Unit tests for `buildFailByModuleData`:
- Normal input → slices sorted by fail count desc, zero-fail modules excluded.
- More than 8 failing modules → top 8 plus one `Other` slice summing the remainder.
- Exactly 8 or fewer → no `Other` slice.
- Zero failures → `[]`.

Component behavior is exercised by the smoke test (renders, no console errors).

## Docs to update in the same change

- `README.md` Dashboard section — add the "Failures by Module" pie line.
- `.claude/skills/smoke-test/SKILL.md` — add the panel label to the dashboard checks.
