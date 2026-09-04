import { describe, expect, it } from "vitest";
import {
  buildBarChart,
  buildLineChart,
  computeStats,
  formatTickLabel,
  niceTicks,
  renderBarChartSVG,
  renderLineChartSVG,
  scaleLinear,
  truncateLabel,
} from "../src/lib/charts.js";

describe("scaleLinear", () => {
  it("maps a value proportionally from domain to range", () => {
    expect(scaleLinear(5, [0, 10], [0, 100])).toBe(50);
    expect(scaleLinear(0, [0, 10], [0, 100])).toBe(0);
    expect(scaleLinear(10, [0, 10], [0, 100])).toBe(100);
  });

  it("handles an inverted range (e.g. SVG y-axis)", () => {
    expect(scaleLinear(0, [0, 10], [200, 0])).toBe(200);
    expect(scaleLinear(10, [0, 10], [200, 0])).toBe(0);
  });

  it("returns the range start when domain is degenerate", () => {
    expect(scaleLinear(5, [3, 3], [0, 100])).toBe(0);
  });
});

describe("niceTicks", () => {
  it("produces evenly spaced round numbers spanning the domain", () => {
    const ticks = niceTicks(0, 97, 5);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97);
    // Spacing between consecutive ticks should be constant.
    const diffs = ticks.slice(1).map((t, i) => Math.round((t - ticks[i]!) * 1e6) / 1e6);
    expect(new Set(diffs).size).toBe(1);
  });

  it("handles a degenerate min === max domain without throwing", () => {
    const ticks = niceTicks(5, 5, 5);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks[0]).toBeLessThan(5);
  });

  it("handles a zero domain", () => {
    const ticks = niceTicks(0, 0, 5);
    expect(ticks).toEqual([0, 1]);
  });
});

describe("computeStats", () => {
  it("computes min/max/mean/median for an odd-length array", () => {
    const stats = computeStats([5, 1, 3]);
    expect(stats).toEqual({ count: 3, min: 1, max: 5, mean: 3, median: 3 });
  });

  it("computes the median as an average for even-length arrays", () => {
    const stats = computeStats([1, 2, 3, 4]);
    expect(stats.median).toBe(2.5);
    expect(stats.mean).toBe(2.5);
  });

  it("returns NaN fields for an empty array", () => {
    const stats = computeStats([]);
    expect(stats.count).toBe(0);
    expect(Number.isNaN(stats.min)).toBe(true);
  });
});

describe("buildBarChart", () => {
  it("lays out one bar per datum within the plot area", () => {
    const layout = buildBarChart(
      [
        { label: "a", value: 10 },
        { label: "b", value: 20 },
      ],
      { width: 400, height: 200 },
    );
    expect(layout.bars).toHaveLength(2);
    for (const bar of layout.bars) {
      expect(bar.x).toBeGreaterThanOrEqual(layout.plotArea.x);
      expect(bar.x + bar.width).toBeLessThanOrEqual(layout.plotArea.x + layout.plotArea.width + 0.01);
      expect(bar.height).toBeGreaterThanOrEqual(0);
    }
    // Taller value should produce a taller bar.
    expect(layout.bars[1]!.height).toBeGreaterThan(layout.bars[0]!.height);
  });

  it("handles an empty dataset without throwing", () => {
    const layout = buildBarChart([], { width: 400, height: 200 });
    expect(layout.bars).toEqual([]);
  });
});

describe("buildLineChart", () => {
  it("maps points into the plot area and builds an SVG path", () => {
    const layout = buildLineChart(
      [
        { x: 0, y: 0 },
        { x: 5, y: 10 },
        { x: 10, y: 5 },
      ],
      { width: 400, height: 200 },
    );
    expect(layout.points).toHaveLength(3);
    expect(layout.path.startsWith("M")).toBe(true);
    expect(layout.path).toContain("L");
    for (const p of layout.points) {
      expect(p.x).toBeGreaterThanOrEqual(layout.plotArea.x - 0.01);
      expect(p.x).toBeLessThanOrEqual(layout.plotArea.x + layout.plotArea.width + 0.01);
    }
  });

  it("returns an empty layout for no data", () => {
    const layout = buildLineChart([], { width: 400, height: 200 });
    expect(layout.points).toEqual([]);
    expect(layout.path).toBe("");
  });
});

describe("SVG rendering", () => {
  it("renders a bar chart as a well-formed SVG string", () => {
    const svg = renderBarChartSVG(
      [
        { label: "cats", value: 3 },
        { label: "dogs", value: 7 },
      ],
      { width: 300, height: 150 },
    );
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("</svg>");
    expect(svg).toContain("<rect");
    expect((svg.match(/<rect/g) ?? []).length).toBe(2);
  });

  it("renders a line chart as a well-formed SVG string with a path", () => {
    const svg = renderLineChartSVG(
      [
        { x: 0, y: 1 },
        { x: 1, y: 2 },
      ],
      { width: 300, height: 150 },
    );
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain("<path");
  });

  it("escapes XML-sensitive characters in labels", () => {
    const svg = renderBarChartSVG([{ label: "<script>&'\"", value: 1 }], { width: 200, height: 100 });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;");
  });
});

describe("formatting helpers", () => {
  it("formatTickLabel rounds noisy floats", () => {
    expect(formatTickLabel(1.0000000001)).toBe("1");
    expect(formatTickLabel(3.14159265)).toBe("3.14");
  });

  it("truncateLabel shortens long labels with an ellipsis", () => {
    expect(truncateLabel("short")).toBe("short");
    expect(truncateLabel("a-very-long-category-label")).toMatch(/…$/);
  });
});
