# @kasap/csv-to-dashboard

A tiny local web tool: point it at a CSV file and get an instant dashboard —
auto-inferred column types, bar charts for categorical columns, line charts
for numeric-over-time data, and a stats table for numeric columns. No
charting library, no frontend framework, no build step for the UI — the
server is plain `node:http` and the charts are hand-rolled inline SVG.

## What it does

- **RFC4180-aware CSV parsing** — a real character-by-character parser that
  correctly handles quoted fields with embedded commas/newlines and escaped
  `""` quotes, instead of naive-splitting on commas.
- **Type inference** per column: `number`, `date`, `categorical`, or `text`,
  based on scanning sample values (not just the header name).
- **Auto-generated charts**, computed and rendered as inline SVG:
  - Bar chart of value counts for categorical columns.
  - Line chart of each numeric column plotted over the first detected date
    column.
  - Min / max / mean / median stats table for numeric columns.
- Everything runs **locally in your browser** after the file is read with
  `File.text()` — the CSV content itself is never uploaded anywhere.

## Usage

From the repo root (or inside this package):

```bash
pnpm --filter @kasap/csv-to-dashboard build
pnpm --filter @kasap/csv-to-dashboard exec csv-to-dashboard serve --port 4173
```

Or during development, without building first:

```bash
pnpm --filter @kasap/csv-to-dashboard dev -- serve --port 4173
```

Then open **http://localhost:4173** in a browser and choose a `.csv` file
with the file picker. The dashboard renders below it.

### CLI

```
csv-to-dashboard serve [--port <port>]
```

- `--port, -p` — port to listen on (default `4173`).

## How the pieces fit together

- `src/lib/csv.ts` — the RFC4180 parser (`parseCSV`, `parseCSVRows`,
  `parseCSVToObjects`).
- `src/lib/inference.ts` — column type inference (`inferColumns`,
  `inferColumnType`, `isNumberLike`, `isDateLike`).
- `src/lib/charts.ts` — pure chart-layout math and inline-SVG string
  generation (`buildBarChart`, `buildLineChart`, `niceTicks`, `scaleLinear`,
  `computeStats`, `renderBarChartSVG`, `renderLineChartSVG`).
- `src/server.ts` / `src/cli.ts` — a minimal static file server that serves
  `public/index.html` + `public/app.js`, plus the *compiled* `dist/lib/*.js`
  modules directly so the browser runs the exact same logic that the unit
  tests exercise (no bundler needed — these modules have no Node-only
  dependencies, so they load as plain ES modules in the browser too).
- `public/app.js` — vanilla JS glue: reads the file, calls into the modules
  above, and injects the resulting HTML/SVG into the page.

## Tests

```bash
pnpm --filter @kasap/csv-to-dashboard test
```

Tests cover the CSV parser (quoting, embedded commas/newlines, escaped
quotes, CRLF, blank lines), the type-inference heuristics, and the chart
math (scales, "nice" tick generation, bar/line layout, stats, SVG escaping)
— all pure functions, no DOM or browser required.
