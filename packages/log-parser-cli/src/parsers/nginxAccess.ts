/**
 * Parser for the standard nginx "combined" access log format:
 *
 *   $remote_addr - $remote_user [$time_local] "$request" $status
 *   $body_bytes_sent "$http_referer" "$http_user_agent"
 */

export interface NginxAccessEntry {
  ip: string;
  remoteUser: string;
  timestamp: Date | undefined;
  method: string | undefined;
  path: string | undefined;
  protocol: string | undefined;
  status: number;
  bodyBytesSent: number | undefined;
  referer: string;
  userAgent: string;
  raw: string;
}

const COMBINED_LOG_PATTERN =
  /^(\S+) (\S+) (\S+) \[([^\]]+)] "([^"]*)" (\d{3}) (\S+) "([^"]*)" "([^"]*)"$/;

const REQUEST_LINE_PATTERN = /^(\S+)\s+(\S+)\s+(\S+)$/;

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Parse a single nginx combined-format access log line, or null if it doesn't match. */
export function parseNginxAccessLine(line: string): NginxAccessEntry | null {
  const match = COMBINED_LOG_PATTERN.exec(line.trim());
  if (!match) return null;

  const [, ip, , remoteUser, timeLocal, request, status, bodyBytesSent, referer, userAgent] = match;
  const requestMatch = REQUEST_LINE_PATTERN.exec(request ?? "");

  return {
    ip: ip as string,
    remoteUser: remoteUser as string,
    timestamp: parseNginxTime(timeLocal as string),
    method: requestMatch?.[1],
    path: requestMatch?.[2],
    protocol: requestMatch?.[3],
    status: Number(status),
    bodyBytesSent: bodyBytesSent === "-" ? undefined : Number(bodyBytesSent),
    referer: referer as string,
    userAgent: userAgent as string,
    raw: line,
  };
}

const NGINX_TIME_PATTERN = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/;

/** Parse nginx's `$time_local` format, e.g. `10/Oct/2023:13:55:36 -0700`. */
export function parseNginxTime(timeLocal: string): Date | undefined {
  const match = NGINX_TIME_PATTERN.exec(timeLocal);
  if (!match) return undefined;

  const [, day, monthName, year, hour, minute, second, offset] = match;
  const month = MONTHS[monthName as string];
  if (month === undefined) return undefined;

  const offsetSign = (offset as string)[0] === "-" ? -1 : 1;
  const offsetHours = Number((offset as string).slice(1, 3));
  const offsetMinutes = Number((offset as string).slice(3, 5));
  const offsetTotalMinutes = offsetSign * (offsetHours * 60 + offsetMinutes);

  const utcMillis =
    Date.UTC(Number(year), month, Number(day), Number(hour), Number(minute), Number(second)) -
    offsetTotalMinutes * 60_000;

  return new Date(utcMillis);
}
