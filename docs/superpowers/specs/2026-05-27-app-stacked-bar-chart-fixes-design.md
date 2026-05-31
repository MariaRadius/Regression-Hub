# AppStackedBarChart — Label Overlap & Corner Rounding Fixes

**Date:** 2026-05-27  
**Jira:** RXR-11849  
**File:** `app/(app)/dashboard/charts/AppStackedBarChart.jsx`

---

## Problem

Two visual defects in the Application Summary chart:

1. **X-axis labels overlap** when there are 4+ app names — e.g. "Practice Admin", "Super Admin", "RadiusExam", "EYEVIA" all crowd into the same horizontal space.
2. **Rounded corners are not stack-aware** — the current implementation always rounds the top of the Pass segment via a two-`<rect>` hack, even when Pass is not the topmost visible segment.

---

## Design

### 1. X-axis label wrapping

Replace the current `tickLabelProps` shorthand on `AxisBottom` with a `tickComponent` that renders wrapped SVG text.

**Rules:**
- Available width per label = `xScale.bandwidth()`
- Measure text width using an off-screen `<canvas>` `measureText` call (precision over char-width heuristic)
- Greedily pack space-separated words into **line 1**, overflow to **line 2**
- If a single word alone exceeds bandwidth, truncate with `…`
- Maximum 2 lines — any overflow beyond line 2 is also truncated with `…`
- Render as SVG `<text>` + two `<tspan>` elements; second tspan uses `dy="1.2em"`
- `MARGIN.bottom` increases from `30` → `48` to accommodate the second line

**No font-size scaling** — truncation with ellipsis is the fallback for oversized words.

---

### 2. Stack-aware rounded corners

**Rule (simplified):**

| Segment position | Rendering |
|---|---|
| Topmost visible segment (or sole segment) | `<path>` with rounded top-left + top-right corners, radius = `3px` |
| All other segments | Plain `<rect>` |

**"Topmost visible"** means the segment with the smallest `bar.y` value (highest point in SVG coordinates) that has `bar.height > 0` for a given bar index.

**Implementation:**
- Pre-compute `topKeyPerBar: Map<barIndex, keyIndex>` before the render loop, by scanning `barStacks` for the last key (highest stack position) with `bar.height > 0` per bar.
- Replace the existing two-`<rect>` hack with a single element per segment: `<path>` for the top segment, `<rect>` for all others.
- One path helper: `topRoundedRect(x, y, w, h, r)` — returns an SVG `d` string with rounded top-left and top-right corners, square bottom corners.

---

## Out of scope

- No changes to `TesterBarChart`, `ModuleBarChart`, or `DonutChart`
- No changes to `chartTheme.js`
- No changes to tooltip or hover/click behaviour
