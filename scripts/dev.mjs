#!/usr/bin/env node
/**
 * `npm run dev`: builds the 404 page, serves dist/ on http://localhost:8404 (PORT moves it), and rebuilds
 * whenever a file in src/ or vendor/ changes, then reloads the open page. No dependencies: Node's own
 * http server, a file watch, and a server-sent event the served page listens for. The built file itself
 * never carries the reload script; it is added only on its way to the browser.
 */
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const port = Number(process.env.PORT) || 8404;
const TYPES = { ".html": "text/html; charset=utf-8", ".mp3": "audio/mpeg", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const RELOAD = `<script>new EventSource("/__reload").onmessage = () => location.reload();</script>`;

function build() {
  try {
    execFileSync(process.execPath, [join(root, "scripts/build.mjs")], { stdio: "pipe" });
    console.log(`built  dist/404.html  ${new Date().toLocaleTimeString()}`);
    return true;
  } catch (e) {
    console.error(String(e.stderr || e.message).trim());
    return false;
  }
}

// every open page holds one of these; a rebuild tells them all to reload
const pages = new Set();
const reload = () => { for (const res of pages) res.write("data: reload\n\n"); };

let wait = 0;
for (const dir of ["src", "src/scene", "vendor"]) {
  watch(join(root, dir), () => { clearTimeout(wait); wait = setTimeout(() => { if (build()) reload(); }, 120); });
}

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (path === "/__reload") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": open\n\n");
    pages.add(res);
    req.on("close", () => pages.delete(res));
    return;
  }
  // the page is served at / as well as at its own name; nothing outside dist/ is ever served
  const file = normalize(join(dist, path === "/" ? "404.html" : path));
  if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    const type = TYPES[extname(file)] || "application/octet-stream";
    let body = await readFile(file);
    if (type.startsWith("text/html")) body = body.toString().replace("</body>", `${RELOAD}\n</body>`);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

build();
server.listen(port, () => {
  console.log(`\n  404 page  http://localhost:${port}/`);
  console.log(`  light     http://localhost:${port}/?theme=light`);
  console.log(`  dark      http://localhost:${port}/?theme=dark\n`);
  console.log("  Watching src/ and vendor/. Edits rebuild the page and reload the browser. Ctrl+C stops.\n");
});
