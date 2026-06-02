// app/(app)/dashboard/charts/DonutChart.jsx
'use client';

import { Group } from '@visx/group';
import { useParentSize } from '@visx/responsive';
import { arc as d3Arc, Pie } from '@visx/shape';
import { TooltipWithBounds, useTooltip } from '@visx/tooltip';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useChartHover } from './ChartHoverContext';
import { CHART_FADE_IN_STYLE, CHART_THEME, TOOLTIP_STYLE } from './chartTheme';

const KEYS = ['Pass', 'Fail', 'Pending'];
const STATUS_COLOR = {
  Pass: CHART_THEME.pass,
  Fail: CHART_THEME.fail,
  Pending: CHART_THEME.pending,
};
const INNER_RADIUS_FRACTION = 0.6;
const ACTIVE_EXPAND = 6;
const CORNER_RADIUS = 3;
// Smallest angular span (radians, ~10°) any non-zero slice may occupy, so a
// lone failure among thousands of pending stays a visible wedge.
const MIN_SLICE_ANGLE = 0.18;
const LABEL_ELBOW = 16; // gap from donut edge to the side label column
const LABEL_TICK = 6; // short horizontal tick before the text
const LABEL_VERT_MARGIN = 10; // top/bottom room for label text half-height
const LABEL_SIDE_SPACE = 92; // horizontal room each side (elbow + tick + text)

/**
 * Convert raw slice values into pie fractions where every non-zero slice spans
 * at least `minFraction` of the circle, conserving the whole by trimming the
 * surplus proportionally from slices already above the floor. Zero-valued
 * slices stay at 0 (no wedge). Returns fractions summing to ~1.
 */
function minSliceFractions(values, minFraction) {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  if (total <= 0) return values.map(() => 0);

  const out = values.map((v) => (v > 0 ? v / total : 0));
  let deficit = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] > 0 && out[i] < minFraction) {
      deficit += minFraction - out[i];
      out[i] = minFraction;
    }
  }
  if (deficit <= 0) return out;

  let givable = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] > minFraction) givable += out[i] - minFraction;
  }
  // Circle too crowded to seat every floor; slices keep the floor and the sum
  // overflows slightly — unavoidable without dropping a slice.
  if (givable <= 0) return out;

  const ratio = Math.min(1, deficit / givable);
  for (let i = 0; i < out.length; i++) {
    if (out[i] > minFraction) out[i] -= (out[i] - minFraction) * ratio;
  }
  return out;
}

/**
 * Hollow donut chart — overall Pass/Fail/Pending summary.
 * @see app/(app)/dashboard/charts/DonutChart.jsx
 * @param {{ name: 'Pass'|'Fail'|'Pending', value: number, total: number }[]} donutData
 */
export default function DonutChart({ donutData }) {
  const router = useRouter();
  const { hoveredStatus, setHoveredStatus } = useChartHover();
  // activeIndex tracks which arc is directly hovered (for the expand effect).
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

  // Height-led radius (small vertical margin); reserve just enough horizontal
  // room for the side label columns so the donut stays as large as possible.
  const radius = Math.max(
    0,
    Math.min(height / 2 - LABEL_VERT_MARGIN, width / 2 - LABEL_SIDE_SPACE),
  );
  const innerRadius = radius * INNER_RADIUS_FRACTION;

  const total = donutData.reduce((s, d) => s + d.value, 0);
  const passPercent =
    total > 0
      ? Math.round(
          ((donutData.find((d) => d.name === 'Pass')?.value ?? 0) / total) *
            100,
        )
      : 0;

  // Pie angles are driven by floored fractions (min slice size); labels and the
  // tooltip keep reading the real `value`.
  const displayFractions = minSliceFractions(
    donutData.map((d) => d.value),
    MIN_SLICE_ANGLE / (2 * Math.PI),
  );
  const pieData = donutData.map((d, i) => ({
    ...d,
    displayValue: displayFractions[i],
  }));

  return (
    <div
      ref={parentRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {width > 0 && radius > 0 && (
        <svg
          width={width}
          height={height}
          role='img'
          aria-label='Test results donut chart'
          style={{ animation: 'chartFadeIn 0.4s ease forwards' }}
        >
          <defs>
            <style>{CHART_FADE_IN_STYLE}</style>
          </defs>
          <Group top={height / 2} left={width / 2}>
            <Pie
              data={pieData}
              pieValue={(d) => d.displayValue}
              outerRadius={radius}
              innerRadius={innerRadius}
              padAngle={0.03}
            >
              {(pie) =>
                pie.arcs.map((arc, i) => {
                  const { name, value } = arc.data;
                  const isDirectlyHovered = activeIndex === i;
                  // Expand when directly hovered, or when another chart is
                  // hovering the same status (and no arc is locally hovered).
                  const shouldExpand =
                    isDirectlyHovered ||
                    (activeIndex === null &&
                      hoveredStatus === name &&
                      hoveredStatus !== null);
                  const arcPath = d3Arc()
                    .innerRadius(innerRadius)
                    .outerRadius(shouldExpand ? radius + ACTIVE_EXPAND : radius)
                    .cornerRadius(CORNER_RADIUS)(arc);
                  const dim = hoveredStatus !== null && hoveredStatus !== name;
                  const color = STATUS_COLOR[name];

                  // External `Name Count` label in a side column — uses the
                  // empty left/right space so the donut keeps its full radius.
                  // Present (value > 0) slices only.
                  let label = null;
                  if (value > 0) {
                    const [ex, ey] = d3Arc()
                      .innerRadius(radius)
                      .outerRadius(radius)
                      .centroid(arc);
                    const dir = ex >= 0 ? 1 : -1; // right vs left column
                    const colX = dir * (radius + LABEL_ELBOW);
                    // Pin the label beside its slice but never past the donut's
                    // vertical extent, so it stays within the svg bounds.
                    const labelY = Math.max(
                      -(radius - LABEL_VERT_MARGIN),
                      Math.min(radius - LABEL_VERT_MARGIN, ey),
                    );
                    const textX = colX + dir * LABEL_TICK;
                    label = (
                      <g
                        style={{
                          opacity: dim ? 0.5 : 1,
                          transition: 'opacity 0.15s ease',
                          pointerEvents: 'none',
                        }}
                      >
                        <polyline
                          points={`${ex},${ey} ${colX},${labelY} ${textX},${labelY}`}
                          fill='none'
                          stroke={color}
                          strokeWidth={1}
                        />
                        <text
                          x={textX + dir * 3}
                          y={labelY}
                          textAnchor={dir === 1 ? 'start' : 'end'}
                          dominantBaseline='middle'
                          fontSize={12}
                          fontWeight={600}
                          fill={color}
                        >
                          {name} {value}
                        </text>
                      </g>
                    );
                  }

                  return (
                    <g key={name}>
                      {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG path is a chart segment — no native interactive equivalent inside SVG */}
                      <path
                        d={arcPath}
                        fill={color}
                        cursor='pointer'
                        style={{
                          opacity: dim ? 0.5 : 1,
                          transition: 'opacity 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          setActiveIndex(i);
                          setHoveredStatus(name);
                          const rect = e.currentTarget
                            .closest('svg')
                            .parentElement.getBoundingClientRect();
                          showTooltip({
                            tooltipData: arc.data,
                            tooltipLeft: e.clientX - rect.left,
                            tooltipTop: e.clientY - rect.top,
                          });
                        }}
                        onMouseLeave={() => {
                          setActiveIndex(null);
                          setHoveredStatus(null);
                          hideTooltip();
                        }}
                        onClick={() =>
                          router.push(`/test-cases?status=${name}`)
                        }
                      />
                      {label}
                    </g>
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
          style={{ position: 'absolute', pointerEvents: 'none' }}
        >
          <div style={TOOLTIP_STYLE}>
            <div
              style={{
                fontSize: 11,
                color: CHART_THEME.text,
                marginBottom: 6,
                fontWeight: 500,
                letterSpacing: '0.02em',
              }}
            >
              Total: {tooltipData.total}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {KEYS.map((key) => {
                const d = donutData.find((x) => x.name === key);
                const pct =
                  tooltipData.total > 0
                    ? Math.round(((d?.value ?? 0) / tooltipData.total) * 100)
                    : 0;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 16,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: STATUS_COLOR[key],
                        fontWeight: key === tooltipData.name ? 700 : 400,
                      }}
                    >
                      {key}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: CHART_THEME.text,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {pct}% ({d?.value ?? 0})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}
