#!/usr/bin/env node
import { Command } from "commander";
import { startServer } from "./server.js";

const program = new Command();

program
  .name("csv-to-dashboard")
  .description("Serve a local dashboard that auto-charts any CSV file you open in the browser")
  .version("0.1.0");

program
  .command("serve")
  .description("Start the local CSV dashboard server")
  .option("-p, --port <port>", "port to listen on", "4173")
  .action(async (opts: { port: string }) => {
    const port = Number.parseInt(opts.port, 10);
    if (!Number.isFinite(port)) {
      console.error(`Invalid port: ${opts.port}`);
      process.exitCode = 1;
      return;
    }
    await startServer({ port });
    console.log(`csv-to-dashboard is running at http://localhost:${port}`);
    console.log("Open that URL in a browser and pick a CSV file to inspect.");
  });

program.parse();
