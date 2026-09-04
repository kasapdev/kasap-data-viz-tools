import { parseGenericLine } from "./parsers/generic.js";
import { parseNginxAccessLine } from "./parsers/nginxAccess.js";
import { parseNginxErrorLine } from "./parsers/nginxError.js";
import type { LogEntry, LogFormat } from "./types.js";

/**
 * Auto-detect the log format from the first non-blank line: tries nginx
 * access, then nginx error, then falls back to generic.
 */
export function detectFormat(lines: string[]): LogFormat {
  for (const line of lines) {
    if (!line.trim()) continue;
    if (parseNginxAccessLine(line)) return "nginx-access";
    if (parseNginxErrorLine(line)) return "nginx-error";
    break;
  }
  return "generic";
}

function toEntry(line: string, format: LogFormat): LogEntry {
  if (format === "nginx-access") {
    const parsed = parseNginxAccessLine(line);
    if (parsed) {
      return {
        timestamp: parsed.timestamp,
        ip: parsed.ip,
        status: parsed.status,
        path: parsed.path,
        raw: line,
      };
    }
  } else if (format === "nginx-error") {
    const parsed = parseNginxErrorLine(line);
    if (parsed) {
      return {
        timestamp: parsed.timestamp,
        ip: parsed.ip,
        path: parsed.requestPath,
        level: parsed.level,
        message: parsed.message,
        raw: line,
      };
    }
  }

  // Either format is "generic", or a line didn't match the resolved
  // format (e.g. a stray line in an otherwise-nginx file) -- fall back to
  // the generic timestamp+level extractor, which always returns an entry.
  const generic = parseGenericLine(line);
  return {
    timestamp: generic.timestamp,
    level: generic.level,
    message: generic.message,
    raw: line,
  };
}

export interface ParseLogResult {
  format: LogFormat;
  entries: LogEntry[];
}

/**
 * Parse a full log file's lines into normalized entries. If `format` is
 * omitted, it is auto-detected from the first parseable line.
 */
export function parseLogLines(lines: string[], format?: LogFormat): ParseLogResult {
  const resolvedFormat = format ?? detectFormat(lines);
  const entries: LogEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    entries.push(toEntry(line, resolvedFormat));
  }
  return { format: resolvedFormat, entries };
}
