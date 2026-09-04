import { normalizeMessage } from "./normalize.js";
import type { LogEntry } from "./types.js";

export interface StatusClassCounts {
  "2xx": number;
  "3xx": number;
  "4xx": number;
  "5xx": number;
  other: number;
}

function classOfStatus(status: number): keyof StatusClassCounts {
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}

/** Request counts grouped by HTTP status-code class (2xx/3xx/4xx/5xx). */
export function summarizeStatusClasses(entries: LogEntry[]): StatusClassCounts {
  const counts: StatusClassCounts = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, other: 0 };
  for (const entry of entries) {
    if (entry.status === undefined) continue;
    counts[classOfStatus(entry.status)] += 1;
  }
  return counts;
}

const ERROR_LEVELS = new Set(["ERROR", "FATAL"]);

/** Whether an entry should be counted as an "error" for aggregation purposes. */
export function isErrorEntry(entry: LogEntry): boolean {
  if (entry.level && ERROR_LEVELS.has(entry.level.toUpperCase())) return true;
  if (entry.status !== undefined && entry.status >= 400) return true;
  return false;
}

export interface ErrorMessageGroup {
  normalized: string;
  count: number;
  example: string;
}

/**
 * Top error messages, grouped by their normalized form (numbers/UUIDs/IPs
 * replaced with placeholders) so near-duplicate messages collapse together.
 */
export function topErrorMessages(entries: LogEntry[], limit = 10): ErrorMessageGroup[] {
  const groups = new Map<string, { count: number; example: string }>();
  for (const entry of entries) {
    if (!isErrorEntry(entry)) continue;
    const text = entry.message ?? entry.path ?? entry.raw;
    const normalized = normalizeMessage(text);
    const existing = groups.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(normalized, { count: 1, example: text });
    }
  }
  return [...groups.entries()]
    .map(([normalized, g]) => ({ normalized, count: g.count, example: g.example }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export interface HourlyBucket {
  /** Hour bucket key, e.g. "2024-01-15T10:00" (UTC). */
  hour: string;
  total: number;
  errors: number;
  errorRate: number;
}

function bucketHour(date: Date): string {
  return `${date.toISOString().slice(0, 13)}:00`;
}

/** Hourly-bucketed request volume and error rate over time. */
export function hourlyErrorRate(entries: LogEntry[]): HourlyBucket[] {
  const buckets = new Map<string, { total: number; errors: number }>();
  for (const entry of entries) {
    if (!entry.timestamp) continue;
    const key = bucketHour(entry.timestamp);
    const bucket = buckets.get(key) ?? { total: 0, errors: 0 };
    bucket.total += 1;
    if (isErrorEntry(entry)) bucket.errors += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([hour, b]) => ({
      hour,
      total: b.total,
      errors: b.errors,
      errorRate: b.total > 0 ? b.errors / b.total : 0,
    }));
}

export interface OffenderCount {
  value: string;
  count: number;
}

/** Top offending IPs or paths, counted from 4xx/5xx entries only. */
export function topOffenders(entries: LogEntry[], field: "ip" | "path", limit = 10): OffenderCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status === undefined || entry.status < 400) continue;
    const value = entry[field];
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
