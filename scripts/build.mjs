#!/usr/bin/env node
/**
 * Builds the 404 page: `node scripts/build.mjs` writes dist/404.html, one
 * self-contained file with the Hairline kernel and the scene's parts
 * (src/scene) inlined. `--out <file>` writes it elsewhere; `--fragment <file>`
 * also writes the page without its document skeleton. The sound files are
 * not built: they live in dist/audio, next to the page that loads them.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n").trim();

// Functions as replacements, so a `$&` in the sources is pasted as it is.
// The scene, part by part: each part is a function the next ones and main.js call.
const PARTS = ["core", "ground", "blocks", "cranes", "people", "main"];
const scene = PARTS.map((p) => read(`src/scene/${p}.js`)).join("\n\n");
const page = read("src/page.html")
  .replace("/*KERNEL*/", () => `\n${read("vendor/hairline-kernel.js")}\n`)
  .replace("/*SCENE*/", () => `\n${scene}\n`)
  .replace("/*SOUND*/", () => `\n${read("src/sound.js")}\n`);
const [head, body] = page.split("<!-- body -->");

// --out <file> writes the page somewhere else (each worker its own copy); dist/404.html by default.
const o = process.argv.indexOf("--out");
const out = resolve(o > 0 && process.argv[o + 1] ? process.argv[o + 1] : resolve(root, "dist/404.html"));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head.trim()}
</head>
<body>
${body.trim()}
</body>
</html>
`);
console.log(out);

const i = process.argv.indexOf("--fragment");
if (i > 0 && process.argv[i + 1]) {
  const frag = resolve(process.argv[i + 1]);
  // The preview keeps its own name; the page itself says what a visitor needs in the tab.
  const named = head.trim().replace("<title>Page not found</title>", "<title>Construction 404</title>");
  writeFileSync(frag, `${named}\n${body.trim()}\n`);
  console.log(frag);
}
