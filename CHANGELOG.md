# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 2026-09-06

### Fixed

- `@kasap/log-parser-cli`: `parseGenericLine` (`packages/log-parser-cli/src/parsers/generic.ts`)
  no longer drops a line's timestamp when it doesn't also contain a recognized
  level word (`TRACE`/`DEBUG`/`INFO`/`WARN`/`WARNING`/`ERROR`/`FATAL`). The
  package's own doc comment and README promise timestamp and level are each
  extracted independently "when present", but the level match was previously
  mandatory in the regex, so a line like `2024-01-01T00:00:00Z server started`
  fell all the way back to "raw line as message, no timestamp" -- silently
  excluding that entry from `hourlyErrorRate` bucketing. The level segment is
  now its own optional group, and a trailing `\b` was added so a word merely
  prefixed by a level name (e.g. `ERRORS`) is no longer misread as that level
  with a dangling suffix left in the message.
- Added regression tests in `packages/log-parser-cli/tests/generic.test.ts`
  covering: a timestamped line with no level word, a timestamped line with a
  bare `-` separator and no level word, and a line where a level-prefixed
  word (`ERRORS`) must not be mistaken for the level `ERROR`.
