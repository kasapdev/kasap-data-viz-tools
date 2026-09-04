/**
 * Pure chart-layout math and inline-SVG rendering. No charting library:
 * axis ticks, scales, bar/line geometry, and SVG string generation are all
 * implemented here directly so the logic can be unit tested without a DOM.
 */

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_MARGIN: Margin = { top: 20, right: 20, bottom: 44, left: 56 };

/** Linear interpolation of `value` from `domain` into `range`. */
export function scaleLinear(value: number, domain: [number, number], range: [number, number]): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return r0;
  const t = (value - d0) / (d1 - d0);
  return r0 + t * (r1 - r0);
}

/**
 * Paul Heckbert's "nice numbers for graph labels" algorithm: rounds a raw
 * value to the nearest of {1, 2, 5, 10} x 10^n.
 */
function niceNumber(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let niceFraction: number;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else {
    if (fraction <= 1) niceFraction = 1;
    else if (fraction <= 2) niceFraction = 2;
    else if (fraction <= 5) niceFraction = 5;
    else niceFraction = 10;
  }

  return niceFraction * Math.pow(10, exponent);
}

/**
 * Compute a set of "nice" evenly-spaced axis ticks spanning [min, max],
 * targeting roughly `tickCount` ticks.
 */
export function niceTicks(min: number, max: number, tickCount = 5): number[] {
  let lo = min;
  let hi = max;

  if (lo === 0 && hi === 0) {
    // All-zero domain (e.g. an all-zero-value bar chart): a plain 0..1
    // range reads better than an arbitrary +/-1 pad around zero.
    return [0, 1];
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  if (lo > hi) {
    [lo, hi] = [hi, lo];
  }

  const range = niceNumber(hi - lo, false);
  const spacing = niceNumber(range / Math.max(1, tickCount - 1), true);
  const niceMin = Math.floor(lo / spacing) * spacing;
  const niceMax = Math.ceil(hi / spacing) * spacing;

  const ticks: number[] = [];
  const roundingGuard = spacing * 1e-9;
  for (let v = niceMin; v <= niceMax + roundingGuard; v += spacing) {
    ticks.push(Math.round(v / roundingGuard) * roundingGuard);
  }
  return ticks;
}

export interface NumericStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
}

export function computeStats(values: number[]): NumericStats {
  if (values.length === 0) {
    return { count: 0, min: NaN, max: NaN, mean: NaN, median: NaN };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0] as number;
  const max = sorted[count - 1] as number;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / count;
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);
  return { count, min, max, mean, median };
}

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

export interface BarDatum {
  label: string;
  value: number;
}

export interface ChartOptions {
  width: number;
  height: number;
  margin?: Margin;
}

export interface BarLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: number;
}

export interface AxisTick {
  value: number;
  position: number;
}

export interface PlotArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarChartLayout {
  bars: BarLayout[];
  yTicks: AxisTick[];
  plotArea: PlotArea;
}

export function buildBarChart(data: BarDatum[], options: ChartOptions): BarChartLayout {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const plotWidth = Math.max(0, options.width - margin.left - margin.right);
  const plotHeight = Math.max(0, options.height - margin.top - margin.bottom);
  const plotArea: PlotArea = { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight };

  const maxValue = data.reduce((m, d) => Math.max(m, d.value), 0);
  const ticks = niceTicks(0, maxValue || 1, 5);
  const domainMax = ticks[ticks.length - 1] ?? (maxValue || 1);

  const n = data.length;
  const bandWidth = n > 0 ? plotWidth / n : 0;
  const barPadding = bandWidth * 0.2;

  const bars: BarLayout[] = data.map((d, i) => {
    const barHeight = domainMax > 0 ? scaleLinear(d.value, [0, domainMax], [0, plotHeight]) : 0;
    const x = margin.left + i * bandWidth + barPadding / 2;
    const y = margin.top + (plotHeight - barHeight);
    return {
      x,
      y,
      width: Math.max(0, bandWidth - barPadding),
      height: Math.max(0, barHeight),
      label: d.label,
      value: d.value,
    };
  });

  const yTicks: AxisTick[] = ticks.map((t) => ({
    value: t,
    position: margin.top + plotHeight - (domainMax > 0 ? scaleLinear(t, [0, domainMax], [0, plotHeight]) : 0),
  }));

  return { bars, yTicks, plotArea };
}

export function renderBarChartSVG(data: BarDatum[], options: ChartOptions): string {
  const layout = buildBarChart(data, options);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" font-family="system-ui, sans-serif" font-size="11">`,
  );

  for (const tick of layout.yTicks) {
    parts.push(
      `<line x1="${layout.plotArea.x}" y1="${round2(tick.position)}" x2="${round2(layout.plotArea.x + layout.plotArea.width)}" y2="${round2(tick.position)}" stroke="#e5e7eb" />`,
    );
    parts.push(
      `<text x="${layout.plotArea.x - 8}" y="${round2(tick.position + 3)}" text-anchor="end" fill="#6b7280">${formatTickLabel(tick.value)}</text>`,
    );
  }

  parts.push(
    `<line x1="${layout.plotArea.x}" y1="${round2(layout.plotArea.y)}" x2="${layout.plotArea.x}" y2="${round2(layout.plotArea.y + layout.plotArea.height)}" stroke="#9ca3af" />`,
  );
  parts.push(
    `<line x1="${layout.plotArea.x}" y1="${round2(layout.plotArea.y + layout.plotArea.height)}" x2="${round2(layout.plotArea.x + layout.plotArea.width)}" y2="${round2(layout.plotArea.y + layout.plotArea.height)}" stroke="#9ca3af" />`,
  );

  for (const bar of layout.bars) {
    parts.push(
      `<rect x="${round2(bar.x)}" y="${round2(bar.y)}" width="${round2(bar.width)}" height="${round2(bar.height)}" fill="#4c78a8" rx="2"><title>${escapeXml(bar.label)}: ${bar.value}</title></rect>`,
    );
    parts.push(
      `<text x="${round2(bar.x + bar.width / 2)}" y="${round2(layout.plotArea.y + layout.plotArea.height + 16)}" text-anchor="middle" fill="#374151">${escapeXml(truncateLabel(bar.label))}</text>`,
    );
  }

  parts.push("</svg>");
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

export interface LinePoint {
  x: number;
  y: number;
}

export interface LineChartLayout {
  points: { x: number; y: number }[];
  path: string;
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  plotArea: PlotArea;
}

export function buildLineChart(data: LinePoint[], options: ChartOptions): LineChartLayout {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const plotWidth = Math.max(0, options.width - margin.left - margin.right);
  const plotHeight = Math.max(0, options.height - margin.top - margin.bottom);
  const plotArea: PlotArea = { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight };

  if (data.length === 0) {
    return { points: [], path: "", xTicks: [], yTicks: [], plotArea };
  }

  const xValues = data.map((d) => d.x);
  const yValues = data.map((d) => d.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMinRaw = Math.min(0, ...yValues);
  const yMaxRaw = Math.max(...yValues);

  const yTickValues = niceTicks(yMinRaw, yMaxRaw, 5);
  const yDomainMin = yTickValues[0] ?? yMinRaw;
  const yDomainMax = yTickValues[yTickValues.length - 1] ?? yMaxRaw;

  const xTickValues = niceTicks(xMin, xMax, 5).filter((t) => t >= xMin - 1e-9 && t <= xMax + 1e-9);

  const points = data.map((d) => ({
    x: scaleLinear(d.x, [xMin, xMax], [plotArea.x, plotArea.x + plotArea.width]),
    y: scaleLinear(d.y, [yDomainMin, yDomainMax], [plotArea.y + plotArea.height, plotArea.y]),
  }));

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${round2(p.x)},${round2(p.y)}`).join(" ");

  const yTicks: AxisTick[] = yTickValues.map((t) => ({
    value: t,
    position: scaleLinear(t, [yDomainMin, yDomainMax], [plotArea.y + plotArea.height, plotArea.y]),
  }));
  const xTicks: AxisTick[] = xTickValues.map((t) => ({
    value: t,
    position: scaleLinear(t, [xMin, xMax], [plotArea.x, plotArea.x + plotArea.width]),
  }));

  return { points, path, xTicks, yTicks, plotArea };
}

export function renderLineChartSVG(
  data: LinePoint[],
  options: ChartOptions,
  formatX: (v: number) => string = (v) => formatTickLabel(v),
): string {
  const layout = buildLineChart(data, options);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" font-family="system-ui, sans-serif" font-size="11">`,
  );

  for (const tick of layout.yTicks) {
    parts.push(
      `<line x1="${layout.plotArea.x}" y1="${round2(tick.position)}" x2="${round2(layout.plotArea.x + layout.plotArea.width)}" y2="${round2(tick.position)}" stroke="#e5e7eb" />`,
    );
    parts.push(
      `<text x="${layout.plotArea.x - 8}" y="${round2(tick.position + 3)}" text-anchor="end" fill="#6b7280">${formatTickLabel(tick.value)}</text>`,
    );
  }

  for (const tick of layout.xTicks) {
    parts.push(
      `<text x="${round2(tick.position)}" y="${round2(layout.plotArea.y + layout.plotArea.height + 16)}" text-anchor="middle" fill="#374151">${escapeXml(formatX(tick.value))}</text>`,
    );
  }

  parts.push(
    `<line x1="${layout.plotArea.x}" y1="${round2(layout.plotArea.y)}" x2="${layout.plotArea.x}" y2="${round2(layout.plotArea.y + layout.plotArea.height)}" stroke="#9ca3af" />`,
  );
  parts.push(
    `<line x1="${layout.plotArea.x}" y1="${round2(layout.plotArea.y + layout.plotArea.height)}" x2="${round2(layout.plotArea.x + layout.plotArea.width)}" y2="${round2(layout.plotArea.y + layout.plotArea.height)}" stroke="#9ca3af" />`,
  );

  if (layout.path) {
    parts.push(`<path d="${layout.path}" fill="none" stroke="#e45756" stroke-width="2" />`);
    for (const p of layout.points) {
      parts.push(`<circle cx="${round2(p.x)}" cy="${round2(p.y)}" r="2.5" fill="#e45756" />`);
    }
  }

  parts.push("</svg>");
  return parts.join("");
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatTickLabel(value: number): string {
  if (Object.is(value, -0)) value = 0;
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1_000_000 || abs < 0.001)) {
    return value.toExponential(2);
  }
  // Trim floating point noise while keeping up to 2 decimal places.
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}

export function truncateLabel(label: string, maxLength = 12): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1)}…`;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
