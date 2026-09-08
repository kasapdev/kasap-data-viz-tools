#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { collectBreakingChanges, diffSchemas, type DiffNode } from "./lib/diff.js";
import { startServer } from "./server.js";

const program = new Command();

program
  .name("json-schema-diff-visualizer")
  .description("Diff two JSON Schemas (or plain JSON documents) and visualize the structural changes")
  .version("0.2.0");

program
  .command("diff")
  .description("Compute a structural diff between two JSON/schema files")
  .argument("<a>", "path to the first JSON/schema file")
  .argument("<b>", "path to the second JSON/schema file")
  .option("--json", "output the diff tree as JSON (for scripting/CI use)")
  .option(
    "--fail-on-breaking",
    "exit with a non-zero status if the diff contains any backward-incompatible (breaking) change",
  )
  .action((aPath: string, bPath: string, opts: { json?: boolean; failOnBreaking?: boolean }) => {
    let a: unknown;
    let b: unknown;
    try {
      a = JSON.parse(readFileSync(aPath, "utf8"));
      b = JSON.parse(readFileSync(bPath, "utf8"));
    } catch (err) {
      console.error(`Failed to read/parse input files: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    const tree = diffSchemas(a, b);
    const breakingChanges = collectBreakingChanges(tree);

    if (opts.json) {
      console.log(JSON.stringify(tree, null, 2));
    } else {
      printTree(tree);
      console.log();
      console.log(
        breakingChanges.length > 0
          ? `${breakingChanges.length} breaking change(s) detected: ${breakingChanges.map((n) => n.path).join(", ")}`
          : "No breaking changes detected.",
      );
    }

    if (opts.failOnBreaking && breakingChanges.length > 0) {
      process.exitCode = 1;
    }
  });

program
  .command("serve")
  .description("Start the local diff-visualizer web UI")
  .option("-p, --port <port>", "port to listen on", "4174")
  .action(async (opts: { port: string }) => {
    const port = Number.parseInt(opts.port, 10);
    if (!Number.isFinite(port)) {
      console.error(`Invalid port: ${opts.port}`);
      process.exitCode = 1;
      return;
    }
    await startServer({ port });
    console.log(`json-schema-diff-visualizer is running at http://localhost:${port}`);
    console.log("Open that URL in a browser and load two JSON/schema files to compare.");
  });

const STATUS_MARKER: Record<DiffNode["status"], string> = {
  added: "+",
  removed: "-",
  "type-changed": "~",
  "constraint-changed": "~",
  unchanged: " ",
};

function printTree(node: DiffNode, indent = ""): void {
  const detail = node.changes.length > 0 ? ` (${node.changes.join(", ")})` : "";
  const breakingTag = node.breaking ? " [BREAKING]" : "";
  console.log(`${indent}${STATUS_MARKER[node.status]} ${node.key} [${node.status}]${breakingTag}${detail}`);
  for (const child of node.children) {
    printTree(child, `${indent}  `);
  }
}

// `program.parse()` runs the matched command's `.action()` handler
// synchronously (for the `diff` command, which isn't async), so it must
// come *after* `STATUS_MARKER`/`printTree` are declared above -- otherwise
// a non-JSON `diff` invocation throws a "Cannot access before
// initialization" error the moment it tries to call `printTree`.
program.parse();
