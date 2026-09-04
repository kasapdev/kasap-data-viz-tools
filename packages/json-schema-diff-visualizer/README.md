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
- **Web UI**: load two JSON files in the browser; the diff tree renders as
  styled, expandable/collapsible DOM nodes colored by status (added=green,
  removed=red, changed=amber, unchanged=neutral), using plain CSS and
  vanilla JS -- no framework.
- **CLI mode** for scripting/CI: prints the same diff tree as JSON.

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
json-schema-diff-visualizer diff <a.json> <b.json> [--json]
json-schema-diff-visualizer serve [--port <port>]
```

```bash
pnpm --filter @kasap/json-schema-diff-visualizer exec json-schema-diff-visualizer diff schema-v1.json schema-v2.json --json
```

Without `--json`, `diff` prints an indented text tree, e.g.:

```
  $ [unchanged]
    age [type-changed] (type: string -> integer)
    address [added]
      city [added]
      zip [added]
```

## How the pieces fit together

- `src/lib/shape.ts` — `inferShape`, `mergeShapes`, `isLikelySchema`,
  `toSchema`.
- `src/lib/diff.ts` — `diffSchemas` (the recursive tree-diff algorithm),
  `summarizeDiff` (status counts), `deepEqual`.
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
and the diff algorithm: unchanged/identical schemas, added/removed
properties (including recursively-marked subtrees), type changes,
constraint changes (`minLength`/`maxLength`/`enum`/`required`), diffing
inside array `items`, and diffing plain JSON documents via inferred
shapes -- no DOM or browser required.
