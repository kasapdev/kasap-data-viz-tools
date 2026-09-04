/**
 * Fallback parser for generic application logs: extracts a leading
 * ISO-8601-ish timestamp and a level word (ERROR/WARN/INFO/...) when
 * present, and otherwise treats the whole line as the message.
 */

export interface GenericLogEntry {
  timestamp: Date | undefined;
  level: string | undefined;
  message: string;
  raw: string;
}

const LEVEL_WORDS = ["TRACE", "DEBUG", "INFO", "WARN", "WARNING", "ERROR", "FATAL"];

// Longest-first so the regex alternation tries "WARNING" before "WARN" -
// otherwise "WARN" (listed first in LEVEL_WORDS for readability) would
// match as a prefix of "WARNING" and leave "ING ..." dangling in the
// message capture group.
const LEVEL_WORDS_BY_LENGTH = [...LEVEL_WORDS].sort((a, b) => b.length - a.length);

// e.g. "2024-01-15T10:30:00.123Z ERROR Failed to connect" or
//      "2024-01-15 10:30:00 [WARN] Cache miss for key abc123"
const GENERIC_PATTERN = new RegExp(
  `^(\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?)` +
    `\\s*[:\\-]?\\s*\\[?(${LEVEL_WORDS_BY_LENGTH.join("|")})]?\\s*[:\\-]?\\s*(.*)$`,
);

/** Parse a single generic app-log line. Always returns an entry (never null). */
export function parseGenericLine(line: string): GenericLogEntry {
  const trimmed = line.trim();
  const match = GENERIC_PATTERN.exec(trimmed);
  if (match) {
    const [, timestamp, level, message] = match;
    return {
      timestamp: parseIsoish(timestamp as string),
      level: level as string,
      message: message ?? "",
      raw: line,
    };
  }
  return { timestamp: undefined, level: undefined, message: trimmed, raw: line };
}

function parseIsoish(value: string): Date | undefined {
  const millis = Date.parse(value);
  return Number.isNaN(millis) ? undefined : new Date(millis);
}
