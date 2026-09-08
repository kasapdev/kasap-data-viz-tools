# @kasap/json-schema-diff-visualizer

A small local web tool (plus a CLI) that computes and visualizes a
structural diff between two JSON Schemas -- or two plain JSON documents,
whose shape gets inferred first. Each node in the tree is tagged
`added` / `removed` / `type-changed` / `constraint-changed` / `unchanged`
and rendered with an expandable/collapsible colored tree (green/red/amber/
neutral), or emitted as JSON for scripting.

## What it does

- **Shape inference** (`src/lib/shape.ts`): if an input file doesn't look
  like a JSON Schema (no `type`/`properties`/`$schema`/etc.), a minimal
  schema shape is inferred from the plain JSON value -- objects become
  `{ type: "object", properties, required }`, arrays become
  `{ type: "array", items }` (item shapes are merged/unified across all
  array elements), primitives map to their JSON Schema type name.
- **Recursive tree diff** (`src/lib/diff.ts`, the core deliverable): walks
  both schemas in lock-step across `properties` and `items`, and at every
  path reports:
  - `added` / `removed` when a node only exists on one side (its entire
    subtree is then recursively marked the same way),
  - `type-changed` when the `type` differs,
  - `constraint-changed` when any other constraint differs (`minimum`,
    `maximum`, `minLength`, `maxLength`, `pattern`, `enum`, `const`,
    `required`, `format`, etc.), with a human-readable list of exactly
    what changed,
  - `unchanged` otherwise.
- **Breaking-change classification** (`src/lib/diff.ts`): every changed node
  also carries a `breaking: boolean`, telling you whether *that specific
  change* is backward-incompatible under JSON Schema semantics -- see
  [Breaking-change classification](#breaking-change-classification) below.
- **Web UI**: load two JSON files in the browser; the diff tree renders as
  styled, expandable/collapsible DOM nodes colored by status (added=green,
  removed=red, changed=amber, unchanged=neutral), plus a red "breaking"
  badge on any node whose change is backward-incompatible and a one-line
  breaking/non-breaking summary above the tree, using plain CSS and vanilla
  JS -- no framework.
- **CLI mode** for scripting/CI: prints the same diff tree as JSON, or as an
  indented text tree annotated with `[BREAKING]` tags, and can fail the
  process with `--fail-on-breaking` for a CI gate.

## Usage

### Web UI

```bash
pnpm --filter @kasap/json-schema-diff-visualizer build
pnpm --filter @kasap/json-schema-diff-visualizer exec json-schema-diff-visualizer serve --port 4174
```

Then open **http://localhost:4174**, pick a file for "Left (A)" and one for
"Right (B)" (both plain `.json` files, either JSON Schemas or plain JSON
documents), and the diff tree renders below. Click a row with children to
expand/collapse it; changed subtrees are auto-expanded, unchanged ones stay
collapsed.

### CLI

```
json-schema-diff-visualizer diff <a.json> <b.json> [--json] [--fail-on-breaking]
json-schema-diff-visualizer serve [--port <port>]
```

```bash
pnpm --filter @kasap/json-schema-diff-visualizer exec json-schema-diff-visualizer diff schema-v1.json schema-v2.json --json
```

Without `--json`, `diff` prints an indented text tree, e.g.:

```
  $ [unchanged]
    age [type-changed] [BREAKING] (type: string -> integer)
    address [added]
      city [added]
      zip [added]

1 breaking change(s) detected: $.properties.age
```

Pass `--fail-on-breaking` to exit with a non-zero status whenever the diff
contains at least one backward-incompatible change -- handy as a CI gate on
a schema-versioning pipeline:

```bash
json-schema-diff-visualizer diff schema-v1.json schema-v2.json --fail-on-breaking
```

## Breaking-change classification

Every node in the diff tree carries a `breaking: boolean` in addition to its
`status`, classifying whether *that specific change* is backward-incompatible:
some document that validated against the left (old) schema could fail to
validate against the right (new) one. The rules (`src/lib/diff.ts`):

| Change | Breaking? |
| --- | --- |
| Removing a `required` property | Yes |
| Removing an optional property | No |
| Adding a new `required` property | Yes |
| Adding a new optional property | No |
| An existing property becoming `required` | Yes |
| An existing `required` property becoming optional | No |
| Narrowing `type` (e.g. `["string","number"]` -> `"string"`, or dropping `type` restriction -> adding one) | Yes |
| Widening `type` (e.g. `"string"` -> `["string","number"]`, or removing the `type` restriction) | No |
| A disjoint/partial-overlap `type` swap (e.g. `"string"` -> `"integer"`) | Yes |
| Raising `minimum`/`minLength`/`minItems`/`exclusiveMinimum`, or introducing one | Yes |
| Lowering `maximum`/`maxLength`/`maxItems`/`exclusiveMaximum`, or introducing one | Yes |
| Loosening (raising a max, lowering a min) or removing any of the above bounds | No |
| Turning `uniqueItems` on | Yes |
| Turning `uniqueItems` off | No |
| Adding/changing `pattern`, `format`, or `const` | Yes |
| Removing `pattern`, `format`, or `const` | No |
| Narrowing `enum` (drops any previously-allowed value, even while adding others) or introducing an `enum` | Yes |
| Widening `enum` (adds values, keeps every old one) or removing `enum` entirely | No |
| Changing `default` or `description` | No (pure metadata) |

Three helpers work with the resulting tree:

```ts
import { diffSchemas, collectBreakingChanges, isBreakingChange, summarizeBreaking } from "@kasap/json-schema-diff-visualizer";

const tree = diffSchemas(
  { type: "object", properties: { age: { type: "number", minimum: 0 } }, required: ["age"] },
  { type: "object", properties: { age: { type: "number", minimum: 18 } }, required: ["age"] },
);

isBreakingChange(tree); // true -- raising `minimum` rejects previously-valid documents
collectBreakingChanges(tree).map((n) => n.path); // ["$.properties.age"]
summarizeBreaking(tree); // { breaking: 1, nonBreaking: 0 }
```

## How the pieces fit together

- `src/lib/shape.ts` — `inferShape`, `mergeShapes`, `isLikelySchema`,
  `toSchema`.
- `src/lib/diff.ts` — `diffSchemas` (the recursive tree-diff algorithm),
  `summarizeDiff` (status counts), `deepEqual`, and the breaking-change
  classifier: `collectBreakingChanges`, `isBreakingChange`, `summarizeBreaking`.
- `src/server.ts` / `src/cli.ts` — a minimal static file server (same
  pattern as `csv-to-dashboard`) that serves `public/index.html` +
  `public/app.js`, plus the compiled `dist/lib/*.js` modules directly so
  the browser runs the exact diff logic the unit tests exercise.
- `public/app.js` — vanilla JS: loads both files, calls `diffSchemas`,
  renders the colored expandable tree.

## Tests

```bash
pnpm --filter @kasap/json-schema-diff-visualizer test
```

Covers shape inference (primitives, nested objects, array unification),
the diff algorithm (unchanged/identical schemas, added/removed properties
including recursively-marked subtrees, type changes, constraint changes,
diffing inside array `items`, and diffing plain JSON documents via inferred
shapes -- no DOM or browser required), the breaking-change classifier
(every rule in the table above, plus the aggregate helpers), and the built
CLI binary itself (`tests/cli.test.ts` spawns `dist/cli.js` as a real
subprocess -- this is what caught a pre-existing bug where `program.parse()`
ran the `diff` command's synchronous action handler *before* the
module-level `STATUS_MARKER`/`printTree` it depends on were initialized,
crashing every non-`--json` `diff` invocation with a temporal-dead-zone
`ReferenceError`; fixed by moving `program.parse()` to the end of
`src/cli.ts`).
