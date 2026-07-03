// app/(app)/dashboard/charts/FailByModuleChart.jsx
'use client';

import { Group } from '@visx/group';
import { useParentSize } from '@visx/responsive';
import { arc as d3Arc, Pie } from '@visx/shape';
import { TooltipWithBounds, useTooltip } from '@visx/tooltip';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { STATUS } from '@/lib/constants';
import {
  CATEGORICAL_OTHER,
  CATEGORICAL_PALETTE,
  CHART_FADE_IN_STYLE,
  CHART_THEME,
  TOOLTIP_STYLE,
} from './chartTheme';
import { minSliceFractions } from './DonutChart';

const OTHER_NAME = 'Other';
const INNER_RADIUS_FRACTION = 0.62;
const ACTIVE_EXPAND = 6;
const CORNER_RADIUS = 3;
// Smallest angular span (radians, ~10°) any non-zero slice may occupy, so a
// module with a single failure stays a visible, clickable wedge.
const MIN_SLICE_ANGLE = 0.18;
// Small symmetric margin so the (label-free) donut fills the panel.
const CHART_MARGIN = 12;

// Palette color for a slice: the neutral "Other" hue for the rollup, otherwise
// a stable pastel color cycled by index.
function sliceColor(name, index) {
  if (name === OTHER_NAME) return CATEGORICAL_OTHER;
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
}

/**
 * Failure-only donut — one slice per failing module (plus an "Other" rollup),
 * so failures stay legible instead of collapsing into the overall status donut.
 * Module identity is revealed on hover; no leader labels keep the pie clean.
 *
 * @see app/(app)/dashboard/charts/FailByModuleChart.jsx
 * @param {{ name: string, moduleId: string | null, value: number }[]} failData
 */
export default function FailByModuleChart({ failData }) {
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

  const radius = Math.max(0, Math.min(width, height) / 2 - CHART_MARGIN);
  const innerRadius = radius * INNER_RADIUS_FRACTION;

  const total = failData.reduce((s, d) => s + d.value, 0);

  // Pie angles use floored fractions (min slice size); the tooltip keeps
  // reading the real `value`.
  const displayFractions = minSliceFractions(
    failData.map((d) => d.value),
    MIN_SLICE_ANGLE / (2 * Math.PI),
  );
  const pieData = failData.map((d, i) => ({
    ...d,
    color: sliceColor(d.name, i),
    displayValue: displayFractions[i],
  }));

  const goToModule = (slice) => {
    if (!slice.moduleId) return; // "Other" rollup is not navigable
    router.push(`/test-cases?status=${STATUS.FAIL}&moduleId=${slice.moduleId}`);
  };

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
          aria-label='Failures by module donut chart'
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
                  const { name, color, moduleId } = arc.data;
                  const isActive = activeIndex === i;
                  const arcPath = d3Arc()
                    .innerRadius(innerRadius)
                    .outerRadius(isActive ? radius + ACTIVE_EXPAND : radius)
                    .cornerRadius(CORNER_RADIUS)(arc);
                  const dim = activeIndex !== null && !isActive;

                  return (
                    // biome-ignore lint/a11y/noStaticElementInteractions: SVG path is a chart segment — no native interactive equivalent inside SVG
                    <path
                      key={name}
                      d={arcPath}
                      fill={color}
                      cursor={moduleId ? 'pointer' : 'default'}
                      style={{
                        opacity: dim ? 0.5 : 1,
                        transition: 'opacity 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        setActiveIndex(i);
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
                        hideTooltip();
                      }}
                      onClick={() => goToModule(arc.data)}
                    />
                  );
                })
              }
            </Pie>
            {/* Centre label — total failures. fontFamily inherits from page CSS. */}
            <text
              textAnchor='middle'
              dominantBaseline='middle'
              fill={CHART_THEME.fail}
              fontSize={radius * 0.27}
              fontWeight={700}
              letterSpacing='-0.02em'
              dy='-0.2em'
            >
              {total}
            </text>
            <text
              textAnchor='middle'
              dominantBaseline='middle'
              fill={CHART_THEME.text}
              fontSize={radius * 0.12}
              fontWeight={600}
              letterSpacing='0.04em'
              dy='1.1em'
            >
              {total === 1 ? 'FAILURE' : 'FAILURES'}
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
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: tooltipData.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: CHART_THEME.text,
                  fontWeight: 700,
                }}
              >
                {tooltipData.name}
              </span>
            </div>
            {tooltipData.appName && (
              <div
                style={{
                  fontSize: 10,
                  color: CHART_THEME.text,
                  opacity: 0.75,
                  marginLeft: 16,
                  marginBottom: 4,
                }}
              >
                {tooltipData.appName}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                fontSize: 11,
                color: CHART_THEME.text,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>Failed</span>
              <span>
                {total > 0 ? Math.round((tooltipData.value / total) * 100) : 0}%
                ({tooltipData.value})
              </span>
            </div>
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}
