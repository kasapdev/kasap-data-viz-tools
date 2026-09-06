import {
  type ErrorMessageGroup,
  type HourlyBucket,
  type OffenderCount,
  type StatusClassCounts,
  hourlyErrorRate,
  summarizeStatusClasses,
  topErrorMessages,
  topOffenders,
} from "./aggregate.js";
import { parseLogLines } from "./parseLog.js";
import type { LogFormat } from "./types.js";

export interface LogSummary {
  format: LogFormat;
  totalLines: number;
  statusClasses: StatusClassCounts;
  topErrors: ErrorMessageGroup[];
  hourlyErrorRate: HourlyBucket[];
  topOffendingIps: OffenderCount[];
  topOffendingPaths: OffenderCount[];
}

export interface SummarizeOptions {
  /** How many rows to keep in each top-N section (top errors, top offending IPs/paths). Defaults to 10. */
  limit?: number;
}

/** Parse a log file's lines and produce the full summary report. */
export function summarizeLog(lines: string[], format?: LogFormat, options: SummarizeOptions = {}): LogSummary {
  const limit = options.limit ?? 10;
  const { format: resolvedFormat, entries } = parseLogLines(lines, format);
  return {
    format: resolvedFormat,
    totalLines: entries.length,
    statusClasses: summarizeStatusClasses(entries),
    topErrors: topErrorMessages(entries, limit),
    hourlyErrorRate: hourlyErrorRate(entries),
    topOffendingIps: topOffenders(entries, "ip", limit),
    topOffendingPaths: topOffenders(entries, "path", limit),
  };
}
