import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, dirname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export interface StartServerOptions {
  port?: number;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

/** Package root, whether running from src/ (tsx) or dist/ (compiled). */
function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..");
}

/**
 * Start the local static file server hosting the diff-visualizer UI.
 * Serves `public/` (the HTML shell + vanilla JS glue) and the compiled
 * `dist/lib/*.js` diff/shape modules, so the browser runs the exact same
 * tree-diff logic that the unit tests exercise.
 */
export function startServer(options: StartServerOptions = {}): Promise<Server> {
  const port = options.port ?? 4174;
  const root = packageRoot();
  const publicDir = join(root, "public");
  const libDir = join(root, "dist", "lib");

  const server = createServer((req, res) => {
    void handleRequest(req.url ?? "/", publicDir, libDir)
      .then(({ status, contentType, body }) => {
        res.writeHead(status, { "Content-Type": contentType });
        res.end(body);
      })
      .catch((err) => {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Internal server error: ${(err as Error).message}`);
      });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => resolve(server));
  });
}

async function handleRequest(
  rawUrl: string,
  publicDir: string,
  libDir: string,
): Promise<{ status: number; contentType: string; body: string | Buffer }> {
  const url = rawUrl.split("?")[0] ?? "/";

  if (url === "/" || url === "/index.html") {
    return serveFile(join(publicDir, "index.html"));
  }
  if (url === "/app.js") {
    return serveFile(join(publicDir, "app.js"));
  }
  if (url.startsWith("/lib/")) {
    const safePath = normalize(url.slice("/lib/".length)).replace(/^(\.\.[/\\])+/, "");
    return serveFile(join(libDir, safePath));
  }

  return { status: 404, contentType: "text/plain; charset=utf-8", body: "Not found" };
}

async function serveFile(path: string): Promise<{ status: number; contentType: string; body: Buffer }> {
  if (!existsSync(path)) {
    return { status: 404, contentType: "text/plain; charset=utf-8", body: Buffer.from("Not found") };
  }
  const body = await readFile(path);
  const contentType = CONTENT_TYPES[extname(path)] ?? "application/octet-stream";
  return { status: 200, contentType, body };
}
