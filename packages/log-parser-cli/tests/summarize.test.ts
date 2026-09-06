import { describe, expect, it } from "vitest";
import { summarizeLog } from "../src/summarize.js";

const ACCESS_LOG = [
  '127.0.0.1 - - [10/Oct/2023:13:00:00 +0000] "GET / HTTP/1.1" 200 100 "-" "-"',
  '127.0.0.1 - - [10/Oct/2023:13:10:00 +0000] "GET /about HTTP/1.1" 200 100 "-" "-"',
  '10.0.0.9 - - [10/Oct/2023:13:20:00 +0000] "GET /missing HTTP/1.1" 404 0 "-" "-"',
  '10.0.0.9 - - [10/Oct/2023:14:00:00 +0000] "GET /missing HTTP/1.1" 404 0 "-" "-"',
  '10.0.0.9 - - [10/Oct/2023:14:05:00 +0000] "POST /checkout HTTP/1.1" 500 0 "-" "-"',
].join("\n");

const GENERIC_LOG = [
  "2024-01-01T09:00:00Z INFO server started",
  "2024-01-01T09:05:00Z ERROR user 123 not found",
  "2024-01-01T09:06:00Z ERROR user 456 not found",
  "2024-01-01T10:15:00Z WARN slow query took 900 ms",
].join("\n");

describe("summarizeLog (nginx access fixture)", () => {
  it("produces a full summary from raw log text", () => {
    const summary = summarizeLog(ACCESS_LOG.split("\n"));
    expect(summary.format).toBe("nginx-access");
    expect(summary.totalLines).toBe(5);
    expect(summary.statusClasses).toEqual({ "2xx": 2, "3xx": 0, "4xx": 2, "5xx": 1, other: 0 });
    expect(summary.topOffendingIps[0]).toEqual({ value: "10.0.0.9", count: 3 });
    expect(summary.topOffendingPaths.find((p) => p.value === "/missing")?.count).toBe(2);
    // 3 distinct hours: 13:00, 14:00 buckets (13:10 and 13:20 both fall in 13:00 bucket)
    expect(summary.hourlyErrorRate).toHaveLength(2);
    expect(summary.hourlyErrorRate[0]).toMatchObject({ hour: "2023-10-10T13:00", total: 3, errors: 1 });
    expect(summary.hourlyErrorRate[1]).toMatchObject({ hour: "2023-10-10T14:00", total: 2, errors: 2 });
  });
});

describe("summarizeLog (generic app log fixture)", () => {
  it("groups normalized error messages and computes an hourly error rate", () => {
    const summary = summarizeLog(GENERIC_LOG.split("\n"));
    expect(summary.format).toBe("generic");
    expect(summary.topErrors[0]).toMatchObject({ normalized: "user <num> not found", count: 2 });
    expect(summary.hourlyErrorRate).toEqual([
      { hour: "2024-01-01T09:00", total: 3, errors: 2, errorRate: 2 / 3 },
      { hour: "2024-01-01T10:00", total: 1, errors: 0, errorRate: 0 },
    ]);
  });
});

describe("summarizeLog limit option", () => {
  // 15 distinct offending IPs -- more than the top-N default of 10, so this
  // fixture can actually distinguish "capped at 10" from "capped at limit".
  const MANY_IPS_LOG = Array.from(
    { length: 15 },
    (_, i) => `10.0.0.${i} - - [10/Oct/2023:13:00:00 +0000] "GET /x HTTP/1.1" 404 0 "-" "-"`,
  ).join("\n");

  it("defaults topOffendingIps/topErrors to the top 10 when no limit is given", () => {
    const summary = summarizeLog(MANY_IPS_LOG.split("\n"));
    expect(summary.topOffendingIps).toHaveLength(10);
  });

  it("honors a limit greater than 10, previously impossible since summarizeLog ignored --limit entirely", () => {
    const summary = summarizeLog(MANY_IPS_LOG.split("\n"), undefined, { limit: 15 });
    expect(summary.topOffendingIps).toHaveLength(15);
  });

  it("honors a limit smaller than 10", () => {
    const summary = summarizeLog(MANY_IPS_LOG.split("\n"), undefined, { limit: 3 });
    expect(summary.topOffendingIps).toHaveLength(3);
  });

  it("applies the same limit to topErrors", () => {
    const words = [
      "alpha",
      "bravo",
      "charlie",
      "delta",
      "echo",
      "foxtrot",
      "golf",
      "hotel",
      "india",
      "juliet",
      "kilo",
      "lima",
    ];
    const manyErrorsLog = words.map((w) => `2024-01-01T09:00:00Z ERROR failure kind ${w}`).join("\n");
    const summary = summarizeLog(manyErrorsLog.split("\n"), undefined, { limit: 12 });
    expect(summary.topErrors).toHaveLength(12);
  });
});
