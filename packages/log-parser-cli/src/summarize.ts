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

/** Parse a log file's lines and produce the full summary report. */
export function summarizeLog(lines: string[], format?: LogFormat): LogSummary {
  const { format: resolvedFormat, entries } = parseLogLines(lines, format);
  return {
    format: resolvedFormat,
    totalLines: entries.length,
    statusClasses: summarizeStatusClasses(entries),
    topErrors: topErrorMessages(entries),
    hourlyErrorRate: hourlyErrorRate(entries),
    topOffendingIps: topOffenders(entries, "ip"),
    topOffendingPaths: topOffenders(entries, "path"),
  };
}
