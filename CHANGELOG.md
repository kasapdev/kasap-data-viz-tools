# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 2026-09-08

### Added

- `@kasap/json-schema-diff-visualizer` (0.1.0 -> 0.2.0): breaking-change
  classification. Every node in the diff tree now carries a
  `breaking: boolean`, computed from real JSON Schema semantics -- removing
  or newly-adding a `required` property is breaking, adding/removing an
  optional property is not, narrowing/widening `type` is classified by
  subset relationship, tightening numeric/length/item bounds
  (`minimum`/`maximum`/`minLength`/`maxLength`/`minItems`/`maxItems`/
  `exclusiveMinimum`/`exclusiveMaximum`) is breaking while loosening them
  is not, `enum` narrowing (dropping any previously-allowed value) is
  breaking while pure widening is not, adding/removing `pattern`/`format`/
  `const` is breaking/non-breaking respectively, and `default`/`description`
  changes are never breaking. New exports: `collectBreakingChanges`,
  `isBreakingChange`, `summarizeBreaking`. The CLI's `diff` command now
  tags `[BREAKING]` nodes in its text output, prints a summary line, and
  gained a `--fail-on-breaking` flag for CI gating; the web UI shows a
  "breaking" badge per node plus a breaking/non-breaking summary line.
  See the package README's "Breaking-change classification" section for
  the full rule table and a runnable example.

### Fixed

- `@kasap/json-schema-diff-visualizer`: fixed a pre-existing bug in
  `src/cli.ts` where `program.parse()` was called *before* the
  module-level `STATUS_MARKER`/`printTree` it depends on were declared.
  Since `program.parse()` runs a matched command's (synchronous)
  `.action()` handler immediately, every non-`--json` `diff` invocation
  crashed with a temporal-dead-zone `ReferenceError`
  (`Cannot access 'STATUS_MARKER' before initialization`) -- previously
  uncaught because the package had no test that actually spawned the built
  CLI. Fixed by moving `program.parse()` to the end of the file; added
  `tests/cli.test.ts`, which spawns `dist/cli.js` as a real subprocess and
  regression-tests this exact crash alongside `--fail-on-breaking` and
  `--json` behavior.

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
