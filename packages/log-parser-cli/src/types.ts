/** The log format a file/line is (or is treated as) being parsed with. */
export type LogFormat = "nginx-access" | "nginx-error" | "generic";

/**
 * A single log entry, normalized to a common shape regardless of which
 * source format it was parsed from. Fields that don't apply to a given
 * format/line are left undefined.
 */
export interface LogEntry {
  timestamp?: Date;
  ip?: string;
  status?: number;
  path?: string;
  level?: string;
  message?: string;
  raw: string;
}
