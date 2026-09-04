# @kasap/log-parser-cli

A CLI that parses nginx access/error logs (and generic application logs)
and summarizes them: status-code breakdowns, top normalized error messages,
an hourly error-rate report, and the top offending IPs/paths.

## What it does

- **Real regex parsing** for the standard nginx combined access log format:
  `$remote_addr - $remote_user [$time_local] "$request" $status
  $body_bytes_sent "$http_referer" "$http_user_agent"`.
- **Real regex parsing** for the standard nginx error log format:
  `YYYY/MM/DD HH:MM:SS [level] pid#tid: *cid message` (also extracts
  `client:` IP and `request:` path when present in the message).
- A **generic fallback parser** for arbitrary app logs: extracts a leading
  ISO-8601-ish timestamp and a level word (`TRACE`/`DEBUG`/`INFO`/`WARN`/
  `WARNING`/`ERROR`/`FATAL`) when present.
- **Message normalization** for grouping: numbers, UUIDs, and IP addresses
  are replaced with placeholders (`<num>`, `<uuid>`, `<ip>`) so messages
  like `"user 123 not found"` and `"user 456 not found"` count as the same
  error.
- **Aggregation**: status-code class counts (2xx/3xx/4xx/5xx), top
  normalized error messages, hourly-bucketed error rate, and top offending
  IPs/paths (from 4xx/5xx entries).

## Usage

```bash
pnpm --filter @kasap/log-parser-cli build

# Auto-detect the format from the first line:
pnpm --filter @kasap/log-parser-cli exec log-parser-cli /var/log/nginx/access.log

# Force a format and get JSON for scripting:
pnpm --filter @kasap/log-parser-cli exec log-parser-cli app.log --format generic --json
```

Or during development:

```bash
pnpm --filter @kasap/log-parser-cli dev -- /path/to/access.log
```

### CLI

```
log-parser-cli <file> [options]

Options:
  -f, --format <format>  nginx-access | nginx-error | generic | auto (default: auto)
  --json                 output the summary as JSON instead of a text report
  --limit <n>            rows to show in each top-N section (default: 10)
```

### Example output

```
Format: nginx-access
Total parsed lines: 5

Status code classes:
  2xx: 2
  4xx: 2
  5xx: 1

Hourly error rate:
  2023-10-10T13:00  total=3  errors=1  rate=33.3%
  2023-10-10T14:00  total=2  errors=2  rate=100.0%

Top offending IPs (4xx/5xx, top 10):
  [3] 10.0.0.9

Top offending paths (4xx/5xx, top 10):
  [2] /missing
```

## How the pieces fit together

- `src/parsers/nginxAccess.ts` — combined access-log regex parser +
  `$time_local` parsing.
- `src/parsers/nginxError.ts` — error-log regex parser (level/pid/tid/cid),
  plus best-effort `client:`/`request:` extraction.
- `src/parsers/generic.ts` — timestamp + level-word fallback parser.
- `src/normalize.ts` — `normalizeMessage()`, the number/UUID/IP substitution
  used for grouping.
- `src/parseLog.ts` — format auto-detection and per-line dispatch into a
  common `LogEntry` shape.
- `src/aggregate.ts` — the summarization functions: status classes, top
  error groups, hourly error rate, top offenders.
- `src/summarize.ts` — ties parsing + aggregation together into one
  `LogSummary`.
- `src/cli.ts` — the commander-based CLI (human-readable report or `--json`).

## Tests

```bash
pnpm --filter @kasap/log-parser-cli test
```

Tests cover both nginx formats (including UTC-offset time parsing and
optional connection-id handling), the generic fallback, message
normalization, format auto-detection, and the aggregation functions,
using fixture log lines — no real network calls or files touched.
