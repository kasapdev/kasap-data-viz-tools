import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// These tests exercise the *built* CLI entrypoint (dist/cli.js) as a real
// subprocess, rather than importing lib functions directly. That's the
// only way to catch module-load-order bugs in cli.ts itself -- e.g. a
// `program.parse()` call running an `.action()` handler before a `const`
// it depends on has been initialized, which previously made every non-JSON
// `diff` invocation crash with "Cannot access 'STATUS_MARKER' before
// initialization" (a temporal-dead-zone violation). Requires `pnpm build`
// to have run first, same as the rest of this repo's verification flow.
const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

let dir: string;
let aPath: string;
let bPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jsdv-cli-test-"));
  aPath = join(dir, "a.json");
  bPath = join(dir, "b.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function runCli(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync("node", [cliPath, ...args], { encoding: "utf8" });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number | null };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

describe("cli: diff (text output)", () => {
  it("prints a tree with a [BREAKING] tag and a summary line, without crashing (regression test for the STATUS_MARKER TDZ bug)", () => {
    writeFileSync(
      aPath,
      JSON.stringify({ type: "object", properties: { age: { type: "number", minimum: 0 } }, required: ["age"] }),
    );
    writeFileSync(
      bPath,
      JSON.stringify({ type: "object", properties: { age: { type: "number", minimum: 18 } }, required: ["age"] }),
    );

    const { stdout, status } = runCli(["diff", aPath, bPath]);
    expect(status).toBe(0);
    expect(stdout).toContain("age [constraint-changed] [BREAKING]");
    expect(stdout).toContain("1 breaking change(s) detected: $.properties.age");
  });

  it("reports no breaking changes for a purely additive, optional-field diff", () => {
    writeFileSync(aPath, JSON.stringify({ type: "object", properties: { a: { type: "string" } }, required: [] }));
    writeFileSync(
      bPath,
      JSON.stringify({
        type: "object",
        properties: { a: { type: "string" }, b: { type: "number" } },
        required: [],
      }),
    );

    const { stdout, status } = runCli(["diff", aPath, bPath]);
    expect(status).toBe(0);
    expect(stdout).toContain("No breaking changes detected.");
    expect(stdout).not.toContain("[BREAKING]");
  });
});

describe("cli: diff --fail-on-breaking", () => {
  it("exits non-zero when the diff contains a breaking change", () => {
    writeFileSync(aPath, JSON.stringify({ type: "string" }));
    writeFileSync(bPath, JSON.stringify({ type: "integer" }));

    const { status } = runCli(["diff", aPath, bPath, "--fail-on-breaking"]);
    expect(status).not.toBe(0);
  });

  it("exits zero when the diff has no breaking changes", () => {
    writeFileSync(aPath, JSON.stringify({ type: "string" }));
    writeFileSync(bPath, JSON.stringify({ type: "string", description: "updated docs" }));

    const { status } = runCli(["diff", aPath, bPath, "--fail-on-breaking"]);
    expect(status).toBe(0);
  });

  it("does not affect exit code when the flag is omitted, even with breaking changes present", () => {
    writeFileSync(aPath, JSON.stringify({ type: "string" }));
    writeFileSync(bPath, JSON.stringify({ type: "integer" }));

    const { status } = runCli(["diff", aPath, bPath]);
    expect(status).toBe(0);
  });
});

describe("cli: diff --json", () => {
  it("emits parseable JSON with a `breaking` field on each node, and no extra text mixed in", () => {
    writeFileSync(aPath, JSON.stringify({ type: "string" }));
    writeFileSync(bPath, JSON.stringify({ type: "integer" }));

    const { stdout, status } = runCli(["diff", aPath, bPath, "--json"]);
    expect(status).toBe(0);
    const tree = JSON.parse(stdout);
    expect(tree.status).toBe("type-changed");
    expect(tree.breaking).toBe(true);
  });
});
