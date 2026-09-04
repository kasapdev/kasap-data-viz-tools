# kasap-data-viz-tools

A small portfolio of local, dependency-light data and visualization tools.
No SaaS backends, no charting libraries, no frontend frameworks -- plain
Node HTTP servers, hand-rolled inline SVG, and vanilla JS where a browser
UI is involved. TypeScript + ESM throughout, managed as a pnpm workspace.

## Packages

- **[csv-to-dashboard](packages/csv-to-dashboard)** — serve a local
  dashboard that RFC4180-parses any CSV file you open in the browser,
  auto-infers each column's type, and renders bar/line charts plus a
  numeric stats table as hand-generated inline SVG.
- **[log-parser-cli](packages/log-parser-cli)** — a CLI that parses nginx
  access/error logs (or generic app logs) and summarizes status-code
  breakdowns, top normalized error messages, hourly error rate, and top
  offending IPs/paths.
- **[json-schema-diff-visualizer](packages/json-schema-diff-visualizer)** —
  a local web tool (+ CLI) that computes a recursive structural diff
  between two JSON Schemas (or plain JSON documents) and renders it as a
  colored, expandable tree.

## Getting started

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Each package can also be run individually; see its README for usage
examples (including how to start its local server and view it in a
browser).

## Conventions

- pnpm workspace (`pnpm-workspace.yaml`), Node >=22.5.0, `packageManager:
  pnpm@11.22.0`.
- TypeScript + ESM (`NodeNext` module resolution), each package extending
  the root `tsconfig.base.json`.
- Each package: `src/` (implementation), `tests/` (vitest, no real network
  calls), its own `package.json` and `README.md`.
- MIT licensed.

## CI

`.github/workflows/ci.yml` runs on every push/PR to `master`: install,
build all packages (topological order, since the local web tools serve
their compiled `dist/lib/*.js` output directly to the browser), typecheck,
and test.
