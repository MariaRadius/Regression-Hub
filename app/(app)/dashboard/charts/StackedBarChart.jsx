// app/(app)/dashboard/charts/StackedBarChart.jsx
'use client';

import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridColumns, GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { useParentSize } from '@visx/responsive';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { BarStack, BarStackHorizontal } from '@visx/shape';
import { TooltipWithBounds, useTooltip } from '@visx/tooltip';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useChartHover } from './ChartHoverContext';
import {
  CHART_FADE_IN_STYLE,
  CHART_THEME,
  TOOLTIP_STYLE,
  tickLabelProps,
} from './chartTheme';

const KEYS = ['Pass', 'Fail', 'Pending'];
const STATUS_COLOR = {
  Pass: CHART_THEME.pass,
  Fail: CHART_THEME.fail,
  Pending: CHART_THEME.pending,
};
const CORNER_RADIUS = 3;

const DEFAULT_MARGIN = {
  vertical: { top: 10, right: 20, bottom: 48, left: 44 },
  horizontal: { top: 10, right: 16, bottom: 30, left: 112 },
};

const DEFAULT_ROTATE_LABELS_MAX_BOTTOM_MARGIN = 100;

/**
 * Vertical space (px) consumed by tspan dy offsets at −45° rotation.
 * At 45°, a dy of `d` px contributes `d × sin(45°)` vertically.
 * First tspan: dy=0.71em, second: dy=1.2em → (0.71+1.2)×11px × sin(45°) ≈ 14.8px, ceil→15.
 * Subtracted from the available margin before converting to a per-line text-width budget,
 * ensuring two wrapped lines never overflow the bottom of the chart.
 */
const ROTATE_LABEL_DY_OVERHEAD = Math.ceil((0.71 + 1.2) * 11 * Math.SQRT1_2); // ≈ 15px

/** SVG path: rounded top-left and top-right corners only. */
function topRoundedRect(x, y, w, h, r) {
  if (w <= 0 || h <= 0) return '';
  const safeR = Math.min(r, h, w / 2);
  return [
    `M ${x + safeR},${y}`,
    `H ${x + w - safeR}`,
    `Q ${x + w},${y} ${x + w},${y + safeR}`,
    `V ${y + h}`,
    `H ${x}`,
    `V ${y + safeR}`,
    `Q ${x},${y} ${x + safeR},${y}`,
    'Z',
  ].join(' ');
}

/** SVG path: rounded top-right and bottom-right corners only. */
function rightRoundedRect(x, y, w, h, r) {
  if (w <= 0 || h <= 0) return '';
  const safeR = Math.min(r, h / 2, w);
  return [
    `M ${x},${y}`,
    `H ${x + w - safeR}`,
    `Q ${x + w},${y} ${x + w},${y + safeR}`,
    `V ${y + h - safeR}`,
    `Q ${x + w},${y + h} ${x + w - safeR},${y + h}`,
    `H ${x}`,
    'Z',
  ].join(' ');
}

let _measureCtx = null;
function measureText(text, fontSize) {
  if (typeof window === 'undefined') return text.length * fontSize * 0.6;
  if (!_measureCtx) {
    const canvas = document.createElement('canvas');
    _measureCtx = canvas.getContext('2d');
    if (!_measureCtx) return text.length * fontSize * 0.6;
  }
  _measureCtx.font = `${fontSize}px Inter, sans-serif`;
  return _measureCtx.measureText(text).width;
}

/**
 * Split `text` into at most 2 lines that each fit within `maxWidth` pixels.
 * Long single words are truncated with '…'.
 */
function wrapLabel(text, maxWidth, fontSize = 11) {
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    if (lines.length === 1) {
      current = current ? `${current} ${word}` : word;
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (measureText(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.slice(0, 2).map((line) => {
    if (measureText(line, fontSize) <= maxWidth) return line;
    let lo = 0;
    let hi = line.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measureText(`${line.slice(0, mid)}…`, fontSize) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    if (lo === 0) return '';
    return `${line.slice(0, lo)}…`;
  });
}

/**
 * Unified stacked bar chart — vertical (BarStack) or horizontal (BarStackHorizontal).
 *
 * @param {object} props
 * @param {Array<{name: string, Pass: number, Fail: number, Pending: number, [key: string]: any}>} props.data
 * @param {'vertical'|'horizontal'} props.orientation
 * @param {'percentage'|'count'} props.scaleType
 *   'percentage': y-domain 0–100, tooltip shows "42% (18)";
 *   'count': y-domain 0–max-total, tooltip shows raw count.
 * @param {string} props.title  SVG accessible title (required for a11y).
 * @param {{ filterKey: string, valueField: string, encode?: boolean }} [props.navTo]
 *   Serializable navigation config. Builds `/test-cases?{filterKey}={datum[valueField]}&status={status}`.
 *   Set `encode: true` to URI-encode the value (e.g. tester names).
 *   When omitted the chart is display-only (no navigation, cursor stays default).
 * @param {'alpha'|'total'} [props.sortBy]  Client-side sort; omit for pass-through order.
 * @param {number} [props.minBarSize]
 *   Clamp minimum segment height (vertical) or width (horizontal).
 *   Only applied to segments whose data value is > 0.
 * @param {boolean} [props.wrapLabels=true]
 *   Wrap category-axis labels (vertical x-axis only). Opt-out with false.
 * @param {boolean} [props.rotateLabels=false]
 *   Rotate x-axis category labels −45° (vertical orientation only).
 *   The available text budget for wrap/truncate is derived from `rotateLabelsMaxBottomMargin × √2`.
 * @param {number} [props.rotateLabelsMaxBottomMargin=100]
 *   Bottom-margin height (px) reserved for rotated labels. Acts as both the SVG bottom margin
 *   and the cap on wrap/truncate budget (`value × √2`). Only used when `rotateLabels=true`.
 * @param {string} [props.emptyLabel]  Fallback text for blank/null names (horizontal y-axis + tooltip).
 * @param {{ top: number, right: number, bottom: number, left: number }} [props.margin]
 *   Overrides orientation-based defaults.
 */
export default function StackedBarChart({
  data,
  orientation,
  scaleType,
  title,
  navTo,
  sortBy,
  minBarSize,
  wrapLabels = true,
  rotateLabels = false,
  rotateLabelsMaxBottomMargin = DEFAULT_ROTATE_LABELS_MAX_BOTTOM_MARGIN,
  emptyLabel,
  margin: marginProp,
}) {
  const isVertical = orientation === 'vertical';
  const router = useRouter();
  const { hoveredStatus, setHoveredStatus } = useChartHover();
  const {
    showTooltip,
    hideTooltip,
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
  } = useTooltip();
  const { parentRef, width, height } = useParentSize({ debounceTime: 50 });

  const margin =
    marginProp ??
    (rotateLabels && isVertical
      ? {
          ...DEFAULT_MARGIN.vertical,
          bottom: rotateLabelsMaxBottomMargin,
          // Rotated labels extend W×cos(45°) to the left of their tick anchor.
          // Max horizontal overhang = labelMaxWidth / √2 = (margin − dy_overhead).
          left: rotateLabelsMaxBottomMargin - ROTATE_LABEL_DY_OVERHEAD,
        }
      : DEFAULT_MARGIN[orientation]);
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const sortedData = useMemo(() => {
    if (!sortBy) return data;
    const copy = [...data];
    if (sortBy === 'alpha') {
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sortBy === 'total') {
      const getTotal = (d) =>
        Number.isFinite(d.total)
          ? d.total
          : KEYS.reduce((s, k) => s + (Number.isFinite(d[k]) ? d[k] : 0), 0);
      return copy.sort((a, b) => getTotal(b) - getTotal(a));
    }
    return data;
  }, [data, sortBy]);

  // ── Scales ────────────────────────────────────────────────────────────────
  const linearMax =
    scaleType === 'percentage'
      ? 100
      : Math.max(
          ...sortedData.map((d) =>
            Number.isFinite(d.total)
              ? d.total
              : KEYS.reduce(
                  (s, k) => s + (Number.isFinite(d[k]) ? d[k] : 0),
                  0,
                ),
          ),
          1,
        );

  const bandDomain = sortedData.map((d) => d.name);

  // Created for each orientation; only one pair is used per render.
  const xBandScale = scaleBand({
    domain: bandDomain,
    range: [0, innerWidth],
    padding: 0.3,
  });
  const yBandScale = scaleBand({
    domain: bandDomain,
    range: [0, innerHeight],
    padding: 0.35,
  });
  const xLinearScale = scaleLinear({
    domain: [0, linearMax],
    range: [0, innerWidth],
    nice: true,
  });
  const yLinearScale = scaleLinear({
    domain: [0, linearMax],
    range: [innerHeight, 0],
    nice: scaleType === 'count',
  });

  const colorScale = scaleOrdinal({
    domain: KEYS,
    range: KEYS.map((k) => STATUS_COLOR[k]),
  });

  // ── End-segment map ───────────────────────────────────────────────────────
  // topmost (vertical) or rightmost (horizontal) non-zero segment per bar.
  const endKeyPerBar = useMemo(
    () =>
      new Map(
        sortedData.map((d, i) => {
          const endKey =
            [...KEYS].reverse().find((k) => d[k] > 0) ?? KEYS[KEYS.length - 1];
          return [i, endKey];
        }),
      ),
    [sortedData],
  );

  // ── Shared bar-segment renderer ───────────────────────────────────────────
  /**
   * Build the geometry and event props for a single bar segment,
   * then return the appropriate <path> (end segment) or <rect>.
   */
  function renderSegment(barStack, bar, bx, by, bw, bh) {
    const isEnd = endKeyPerBar.get(bar.index) === barStack.key;
    const opacity =
      hoveredStatus === null || hoveredStatus === barStack.key ? 1 : 0.25;

    const sharedProps = {
      fill: STATUS_COLOR[barStack.key],
      opacity,
      style: { transition: 'opacity 0.12s ease' },
      cursor: navTo ? 'pointer' : 'default',
      onMouseEnter: () => {
        setHoveredStatus(barStack.key);
        showTooltip({
          tooltipData: { bar: bar.bar.data, status: barStack.key },
          tooltipLeft: bx + bw / 2 + margin.left,
          tooltipTop: bar.y + margin.top,
        });
      },
      onMouseLeave: () => {
        setHoveredStatus(null);
        hideTooltip();
      },
      ...(navTo && {
        onClick: () => {
          const raw = bar.bar.data[navTo.valueField] ?? '';
          const val = navTo.encode ? encodeURIComponent(raw) : raw;
          router.push(
            `/test-cases?${navTo.filterKey}=${val}&status=${barStack.key}`,
          );
        },
      }),
    };

    return (
      <g key={`${barStack.index}-${bar.index}`}>
        {isEnd && bw > 0 && bh > 0 ? (
          <path
            d={
              isVertical
                ? topRoundedRect(bx, by, bw, bh, CORNER_RADIUS)
                : rightRoundedRect(bx, by, bw, bh, CORNER_RADIUS)
            }
            {...sharedProps}
          />
        ) : (
          <rect x={bx} y={by} width={bw} height={bh} {...sharedProps} />
        )}
      </g>
    );
  }

  // ── Vertical bar render (BarStack) ────────────────────────────────────────
  function renderVerticalBars(barStacks) {
    return barStacks.map((barStack) =>
      barStack.bars.map((bar) => {
        const rawH = Math.max(bar.height, 0);
        const bh = minBarSize && rawH > 0 ? Math.max(rawH, minBarSize) : rawH;
        // Pull bar top up when clamped so the bottom stays at the baseline.
        const by = bh !== rawH ? Math.min(bar.y, innerHeight - bh) : bar.y;
        const bw = Math.max(bar.width, 0);
        return renderSegment(barStack, bar, bar.x, by, bw, bh);
      }),
    );
  }

  // ── Horizontal bar render (BarStackHorizontal) ────────────────────────────
  function renderHorizontalBars(barStacks) {
    return barStacks.map((barStack) =>
      barStack.bars.map((bar) => {
        const rawW = Math.max(bar.width, 0);
        // Clamp width; bar stays anchored at bar.x (no x adjustment needed).
        const bw = minBarSize && rawW > 0 ? Math.max(rawW, minBarSize) : rawW;
        const bh = yBandScale.bandwidth();
        return renderSegment(barStack, bar, bar.x, bar.y, bw, bh);
      }),
    );
  }

  // ── Vertical category-axis tick (with optional label wrapping / rotation) ──
  function verticalCategoryTick({ formattedValue, x, y }) {
    // Rotated budget: midpoint between the geometric max (margin-derived) and
    // bandwidth, so wrapping is tighter than the full diagonal but not as
    // aggressive as the per-bar slot width alone.
    const labelMaxWidth = rotateLabels
      ? ((rotateLabelsMaxBottomMargin - ROTATE_LABEL_DY_OVERHEAD) * Math.SQRT2 +
          xBandScale.bandwidth()) /
        2
      : xBandScale.bandwidth();
    const lines = wrapLabels
      ? wrapLabel(formattedValue, labelMaxWidth, 11)
      : [formattedValue];
    return (
      <text
        x={x}
        y={y}
        textAnchor={rotateLabels ? 'end' : 'middle'}
        fontSize={11}
        fill={CHART_THEME.text}
        fontWeight={500}
        letterSpacing='0.02em'
        transform={rotateLabels ? `rotate(-45, ${x}, ${y})` : undefined}
      >
        {lines.map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tspan order is positional, stable, and never reordered
          <tspan key={i} x={x} dy={i === 0 ? '0.71em' : '1.2em'}>
            {line}
          </tspan>
        ))}
      </text>
    );
  }

  return (
    <div
      ref={parentRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {width > 0 && height > 0 && (
        <svg
          width={width}
          height={height}
          style={{ animation: 'chartFadeIn 0.35s ease forwards' }}
        >
          <title>{title}</title>
          <defs>
            <style>{CHART_FADE_IN_STYLE}</style>
          </defs>
          <Group left={margin.left} top={margin.top}>
            {isVertical ? (
              <>
                <GridRows
                  scale={yLinearScale}
                  width={innerWidth}
                  stroke={CHART_THEME.grid}
                  strokeWidth={1}
                  strokeDasharray='2 4'
                  numTicks={5}
                />
                <BarStack
                  data={sortedData}
                  keys={KEYS}
                  x={(d) => d.name}
                  xScale={xBandScale}
                  yScale={yLinearScale}
                  color={colorScale}
                >
                  {renderVerticalBars}
                </BarStack>
                <AxisLeft
                  scale={yLinearScale}
                  tickFormat={
                    scaleType === 'percentage' ? (v) => `${v}%` : undefined
                  }
                  tickLabelProps={() => tickLabelProps('end', 10)}
                  stroke={CHART_THEME.axis}
                  tickStroke={CHART_THEME.axis}
                  numTicks={5}
                />
                <AxisBottom
                  top={innerHeight}
                  scale={xBandScale}
                  stroke={CHART_THEME.axis}
                  tickStroke='transparent'
                  tickComponent={verticalCategoryTick}
                />
              </>
            ) : (
              <>
                <GridColumns
                  scale={xLinearScale}
                  height={innerHeight}
                  stroke={CHART_THEME.grid}
                  strokeWidth={1}
                  strokeDasharray='2 4'
                />
                <BarStackHorizontal
                  data={sortedData}
                  keys={KEYS}
                  width={innerWidth}
                  y={(d) => d.name}
                  xScale={xLinearScale}
                  yScale={yBandScale}
                  color={colorScale}
                >
                  {renderHorizontalBars}
                </BarStackHorizontal>
                <AxisLeft
                  scale={yBandScale}
                  tickFormat={(v) => (v ? v : (emptyLabel ?? v))}
                  tickLabelProps={() => tickLabelProps('end')}
                  stroke={CHART_THEME.axis}
                  tickStroke='transparent'
                />
                <AxisBottom
                  top={innerHeight}
                  scale={xLinearScale}
                  tickLabelProps={() => tickLabelProps('middle', 10)}
                  stroke={CHART_THEME.axis}
                  tickStroke={CHART_THEME.axis}
                  numTicks={5}
                />
              </>
            )}
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
              {tooltipData.bar.name || emptyLabel || ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {KEYS.map((key) => {
                const countKey = `${key.toLowerCase()}Count`;
                const value =
                  scaleType === 'percentage'
                    ? `${tooltipData.bar[key]}% (${tooltipData.bar[countKey]})`
                    : tooltipData.bar[key];
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
                        fontWeight: hoveredStatus === key ? 700 : 400,
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
                      {value}
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
