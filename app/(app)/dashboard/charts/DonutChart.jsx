// app/(app)/dashboard/charts/DonutChart.jsx
'use client';

import { Group } from '@visx/group';
import { useParentSize } from '@visx/responsive';
import { arc as d3Arc, Pie } from '@visx/shape';
import { TooltipWithBounds, useTooltip } from '@visx/tooltip';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dashboardPercent } from '@/lib/dashboardPercent';
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

  const radius = Math.min(width, height) / 2 - 10;
  const innerRadius = radius * INNER_RADIUS_FRACTION;

  const total = donutData.reduce((s, d) => s + d.value, 0);
  const passPercent = dashboardPercent(
    donutData.find((d) => d.name === 'Pass')?.value ?? 0,
    total,
  );

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
              data={donutData}
              pieValue={(d) => d.value}
              outerRadius={radius}
              innerRadius={innerRadius}
              padAngle={0.03}
            >
              {(pie) =>
                pie.arcs.map((arc, i) => {
                  const isDirectlyHovered = activeIndex === i;
                  // Expand when directly hovered, or when another chart is
                  // hovering the same status (and no arc is locally hovered).
                  const shouldExpand =
                    isDirectlyHovered ||
                    (activeIndex === null &&
                      hoveredStatus === arc.data.name &&
                      hoveredStatus !== null);
                  const arcPath = d3Arc()
                    .innerRadius(innerRadius)
                    .outerRadius(shouldExpand ? radius + ACTIVE_EXPAND : radius)
                    .cornerRadius(CORNER_RADIUS)(arc);
                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: SVG path is a chart segment — no native interactive equivalent inside SVG
                    <path
                      key={arc.data.name}
                      d={arcPath}
                      fill={STATUS_COLOR[arc.data.name]}
                      cursor='pointer'
                      style={{
                        opacity:
                          hoveredStatus === null ||
                          hoveredStatus === arc.data.name
                            ? 1
                            : 0.5,
                        transition: 'opacity 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        setActiveIndex(i);
                        setHoveredStatus(arc.data.name);
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
                const pct = dashboardPercent(d?.value ?? 0, tooltipData.total);
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
