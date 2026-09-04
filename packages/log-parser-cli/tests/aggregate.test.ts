import { describe, expect, it } from "vitest";
import {
  hourlyErrorRate,
  isErrorEntry,
  summarizeStatusClasses,
  topErrorMessages,
  topOffenders,
} from "../src/aggregate.js";
import type { LogEntry } from "../src/types.js";

function entry(partial: Partial<LogEntry>): LogEntry {
  return { raw: "raw", ...partial };
}

describe("summarizeStatusClasses", () => {
  it("buckets statuses into 2xx/3xx/4xx/5xx/other", () => {
    const entries = [
      entry({ status: 200 }),
      entry({ status: 201 }),
      entry({ status: 301 }),
      entry({ status: 404 }),
      entry({ status: 404 }),
      entry({ status: 500 }),
      entry({ status: 700 }),
      entry({}), // no status, ignored
    ];
    expect(summarizeStatusClasses(entries)).toEqual({
      "2xx": 2,
      "3xx": 1,
      "4xx": 2,
      "5xx": 1,
      other: 1,
    });
  });
});

describe("isErrorEntry", () => {
  it("treats ERROR/FATAL levels as errors", () => {
    expect(isErrorEntry(entry({ level: "ERROR" }))).toBe(true);
    expect(isErrorEntry(entry({ level: "fatal" }))).toBe(true);
    expect(isErrorEntry(entry({ level: "INFO" }))).toBe(false);
  });

  it("treats status >= 400 as an error", () => {
    expect(isErrorEntry(entry({ status: 404 }))).toBe(true);
    expect(isErrorEntry(entry({ status: 500 }))).toBe(true);
    expect(isErrorEntry(entry({ status: 200 }))).toBe(false);
  });
});

describe("topErrorMessages", () => {
  it("groups messages by normalized form and counts occurrences", () => {
    const entries = [
      entry({ level: "ERROR", message: "user 123 not found" }),
      entry({ level: "ERROR", message: "user 456 not found" }),
      entry({ level: "ERROR", message: "disk full" }),
      entry({ level: "INFO", message: "user 789 not found" }), // not an error, excluded
    ];
    const groups = topErrorMessages(entries);
    expect(groups[0]).toMatchObject({ normalized: "user <num> not found", count: 2 });
    expect(groups.find((g) => g.normalized === "disk full")?.count).toBe(1);
    expect(groups.reduce((sum, g) => sum + g.count, 0)).toBe(3);
  });

  it("respects the limit parameter", () => {
    const kinds = ["disk full", "network timeout", "auth failed", "cache miss unavailable"];
    const entries = kinds.map((message) => entry({ level: "ERROR", message }));
    expect(topErrorMessages(entries, 2)).toHaveLength(2);
  });
});

describe("hourlyErrorRate", () => {
  it("buckets entries by hour and computes an error rate", () => {
    const entries = [
      entry({ timestamp: new Date("2024-01-01T10:05:00Z"), status: 200 }),
      entry({ timestamp: new Date("2024-01-01T10:40:00Z"), status: 500 }),
      entry({ timestamp: new Date("2024-01-01T11:10:00Z"), status: 200 }),
      entry({ status: 500 }), // no timestamp, ignored
    ];
    const buckets = hourlyErrorRate(entries);
    expect(buckets).toEqual([
      { hour: "2024-01-01T10:00", total: 2, errors: 1, errorRate: 0.5 },
      { hour: "2024-01-01T11:00", total: 1, errors: 0, errorRate: 0 },
    ]);
  });

  it("returns buckets in chronological order", () => {
    const entries = [
      entry({ timestamp: new Date("2024-01-01T15:00:00Z"), status: 200 }),
      entry({ timestamp: new Date("2024-01-01T09:00:00Z"), status: 200 }),
      entry({ timestamp: new Date("2024-01-01T12:00:00Z"), status: 200 }),
    ];
    const buckets = hourlyErrorRate(entries);
    expect(buckets.map((b) => b.hour)).toEqual([
      "2024-01-01T09:00",
      "2024-01-01T12:00",
      "2024-01-01T15:00",
    ]);
  });
});

describe("topOffenders", () => {
  it("counts 4xx/5xx entries by ip", () => {
    const entries = [
      entry({ status: 404, ip: "1.1.1.1" }),
      entry({ status: 500, ip: "1.1.1.1" }),
      entry({ status: 200, ip: "1.1.1.1" }), // not 4xx/5xx, excluded
      entry({ status: 404, ip: "2.2.2.2" }),
    ];
    const offenders = topOffenders(entries, "ip");
    expect(offenders[0]).toEqual({ value: "1.1.1.1", count: 2 });
    expect(offenders[1]).toEqual({ value: "2.2.2.2", count: 1 });
  });

  it("counts 4xx/5xx entries by path", () => {
    const entries = [
      entry({ status: 404, path: "/missing" }),
      entry({ status: 404, path: "/missing" }),
      entry({ status: 500, path: "/broken" }),
    ];
    const offenders = topOffenders(entries, "path");
    expect(offenders[0]).toEqual({ value: "/missing", count: 2 });
  });
});
