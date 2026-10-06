#!/usr/bin/env node
/**
 * Builds the 404 page: `node scripts/build.mjs` writes dist/404.html, one
 * self-contained file with the Hairline kernel and the scene inlined.
 * `--fragment <out>` also writes the page without its document skeleton.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8").replace(/\r\n/g, "\n").trim();

// Functions as replacements, so a `$&` in the sources is pasted as it is.
const page = read("src/page.html")
  .replace("/*KERNEL*/", () => `\n${read("vendor/hairline-kernel.js")}\n`)
  .replace("/*SCENE*/", () => `\n${read("src/construction-404.js")}\n`);
const [head, body] = page.split("<!-- body -->");

const out = resolve(root, "dist/404.html");
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
  writeFileSync(frag, `${head.trim()}\n${body.trim()}\n`);
  console.log(frag);
}
