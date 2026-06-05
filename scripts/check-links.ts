// Internal broken-link sweep over built HTML.
//
// Parses every dist/**/*.html for internal href/src targets and asserts each
// resolves to a real file in dist/. Catches dead entity links, renamed routes,
// and typo'd paths before they ship. External (http) links are skipped — those
// are covered by verify:sources against the data layer.
//
// Usage: pnpm run check:links   (requires a prior `astro build`)

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(import.meta.dirname, "..", "dist");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (e.endsWith(".html")) out.push(p);
  }
  return out;
}

// Resolve an internal link target to a dist/ file path. Returns null if the
// link is external/anchor/asset-data and should be skipped.
function resolveTarget(href: string): string | null {
  let h = href.trim();
  if (!h || h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("data:")) return null;
  if (/^https?:\/\//i.test(h) || h.startsWith("//")) return null;
  h = h.split("#")[0].split("?")[0];
  if (!h) return null;
  if (!h.startsWith("/")) return null; // relative-to-page links are rare here; skip
  const rel = h.replace(/^\/+/, "");
  // Try, in order: exact file, file.html, dir/index.html (covers all build formats)
  for (const cand of [rel, `${rel}.html`, join(rel, "index.html"), `${rel}/index.html`]) {
    if (cand && existsSync(join(DIST, cand)) && statSync(join(DIST, cand)).isFile()) return cand;
  }
  // Trailing-slash directory form
  if (h.endsWith("/") && existsSync(join(DIST, rel, "index.html"))) return join(rel, "index.html");
  return null;
}

if (!existsSync(DIST)) {
  console.error("check:links — dist/ not found; run `astro build` first.");
  process.exit(2);
}

const htmlFiles = walk(DIST);
const broken: Array<{ page: string; href: string }> = [];
let linkCount = 0;
const hrefRe = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;

for (const file of htmlFiles) {
  let body = readFileSync(file, "utf8");
  // Strip <script>/<style> blocks: hrefs there are JS template literals
  // (e.g. `/models/${m.id}`) built at runtime, not static links to resolve.
  body = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
             .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const pageRel = file.slice(DIST.length + 1);
  let mm: RegExpExecArray | null;
  while ((mm = hrefRe.exec(body)) !== null) {
    const href = mm[1];
    if (/^https?:|^#|^mailto:|^data:|^\/\//i.test(href.trim())) continue;
    if (!href.trim().startsWith("/")) continue;
    linkCount++;
    if (resolveTarget(href) === null) broken.push({ page: pageRel, href });
  }
}

console.log(`check:links — scanned ${htmlFiles.length} pages, ${linkCount} internal links`);
if (broken.length) {
  // De-dupe by href (the same nav link breaks on every page)
  const byHref = new Map<string, string>();
  for (const b of broken) if (!byHref.has(b.href)) byHref.set(b.href, b.page);
  console.error(`\n✗ ${broken.length} broken internal links (${byHref.size} distinct):`);
  for (const [href, page] of byHref) console.error(`  ${href}  (first seen: ${page})`);
  process.exit(1);
}
console.log("✓ no broken internal links.");
