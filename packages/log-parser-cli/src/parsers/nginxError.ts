/**
 * Parser for the standard nginx error log format:
 *
 *   YYYY/MM/DD HH:MM:SS [level] pid#tid: *cid message
 *
 * The `*cid` (connection id) segment is optional -- some log lines omit it.
 */

export interface NginxErrorEntry {
  timestamp: Date | undefined;
  level: string;
  pid: number;
  tid: number;
  connectionId: number | undefined;
  message: string;
  /** Best-effort extraction of `client: <ip>` from the message, when present. */
  ip: string | undefined;
  /** Best-effort extraction of the request path from `request: "METHOD /path ..."`. */
  requestPath: string | undefined;
  raw: string;
}

const ERROR_LOG_PATTERN =
  /^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}) \[(\w+)] (\d+)#(\d+): (?:\*(\d+) )?(.*)$/;

const CLIENT_IP_PATTERN = /client: (\d{1,3}(?:\.\d{1,3}){3})/;
const REQUEST_PATTERN = /request: "([A-Z]+) (\S+)/;

/** Parse a single nginx error log line, or null if it doesn't match. */
export function parseNginxErrorLine(line: string): NginxErrorEntry | null {
  const match = ERROR_LOG_PATTERN.exec(line.trim());
  if (!match) return null;

  const [, timestamp, level, pid, tid, connectionId, message] = match;
  const msg = message ?? "";

  return {
    timestamp: parseNginxErrorTime(timestamp as string),
    level: level as string,
    pid: Number(pid),
    tid: Number(tid),
    connectionId: connectionId ? Number(connectionId) : undefined,
    message: msg,
    ip: CLIENT_IP_PATTERN.exec(msg)?.[1],
    requestPath: REQUEST_PATTERN.exec(msg)?.[2],
    raw: line,
  };
}

const ERROR_TIME_PATTERN = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

/** Parse nginx's error-log timestamp format, e.g. `2023/10/10 13:55:36`. */
export function parseNginxErrorTime(timestamp: string): Date | undefined {
  const match = ERROR_TIME_PATTERN.exec(timestamp);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
}
