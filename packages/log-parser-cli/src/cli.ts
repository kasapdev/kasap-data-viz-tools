#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { summarizeLog, type LogSummary } from "./summarize.js";
import type { LogFormat } from "./types.js";

const VALID_FORMATS: LogFormat[] = ["nginx-access", "nginx-error", "generic"];

const program = new Command();

program
  .name("log-parser-cli")
  .description("Parse nginx access/error logs (or generic app logs) and summarize them")
  .version("0.1.0")
  .argument("<file>", "path to the log file")
  .option(
    "-f, --format <format>",
    "log format: nginx-access, nginx-error, generic, or auto (default: auto-detect)",
    "auto",
  )
  .option("--json", "output the summary as JSON instead of a human-readable report")
  .option("--limit <n>", "how many rows to show in each top-N section", "10")
  .action((file: string, opts: { format: string; json?: boolean; limit: string }) => {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (err) {
      console.error(`Could not read file "${file}": ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    let format: LogFormat | undefined;
    if (opts.format !== "auto") {
      if (!VALID_FORMATS.includes(opts.format as LogFormat)) {
        console.error(`Unknown format "${opts.format}". Expected one of: auto, ${VALID_FORMATS.join(", ")}`);
        process.exitCode = 1;
        return;
      }
      format = opts.format as LogFormat;
    }

    const lines = text.split(/\r?\n/);
    const summary = summarizeLog(lines, format);

    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printReport(summary, Number.parseInt(opts.limit, 10) || 10);
    }
  });

program.parse();

function printReport(summary: LogSummary, limit: number): void {
  console.log(`Format: ${summary.format}`);
  console.log(`Total parsed lines: ${summary.totalLines}`);
  console.log();

  console.log("Status code classes:");
  for (const [cls, count] of Object.entries(summary.statusClasses)) {
    if (count > 0) console.log(`  ${cls}: ${count}`);
  }
  console.log();

  if (summary.topErrors.length > 0) {
    console.log(`Top error messages (normalized, top ${limit}):`);
    for (const group of summary.topErrors.slice(0, limit)) {
      console.log(`  [${group.count}] ${group.normalized}`);
      console.log(`        e.g. "${group.example}"`);
    }
    console.log();
  }

  if (summary.hourlyErrorRate.length > 0) {
    console.log("Hourly error rate:");
    for (const bucket of summary.hourlyErrorRate) {
      const pct = (bucket.errorRate * 100).toFixed(1);
      console.log(`  ${bucket.hour}  total=${bucket.total}  errors=${bucket.errors}  rate=${pct}%`);
    }
    console.log();
  }

  if (summary.topOffendingIps.length > 0) {
    console.log(`Top offending IPs (4xx/5xx, top ${limit}):`);
    for (const offender of summary.topOffendingIps.slice(0, limit)) {
      console.log(`  [${offender.count}] ${offender.value}`);
    }
    console.log();
  }

  if (summary.topOffendingPaths.length > 0) {
    console.log(`Top offending paths (4xx/5xx, top ${limit}):`);
    for (const offender of summary.topOffendingPaths.slice(0, limit)) {
      console.log(`  [${offender.count}] ${offender.value}`);
    }
  }
}
