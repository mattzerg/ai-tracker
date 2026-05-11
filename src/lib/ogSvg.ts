// Render a 1200x630 OG card as SVG. Returns a Response with image/svg+xml.
// SVG is reliably rendered by Twitter/X, Slack, and Discord. LinkedIn and
// some scrapers prefer PNG — accept that gap until a satori PNG path lands.

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fitText(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1) + "…";
}

export interface OgCardOpts {
  kind: "model" | "tool";
  title: string;
  subtitle: string; // e.g. "anthropic · 1M context"
  bullets: string[]; // 1-3 short lines, e.g. ["$5/M input · $25/M output", "released 2026-04-16"]
  badge?: string; // small top-right tag, e.g. "MODEL" / "TOOL"
}

export function ogCardSvg(opts: OgCardOpts): string {
  const t = escape(fitText(opts.title, 38));
  const sub = escape(fitText(opts.subtitle, 60));
  const bullets = opts.bullets.slice(0, 3).map((b) => escape(fitText(b, 64)));
  const badge = escape(opts.badge ?? (opts.kind === "model" ? "MODEL" : "TOOL"));

  const accent = opts.kind === "model" ? "#1a4cff" : "#0a8a4f";
  const bg = "#0e1116";
  const fg = "#f5f6fa";
  const dim = "#9aa3b2";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${bg}"/>
  <rect x="0" y="0" width="1200" height="6" fill="${accent}"/>
  <g font-family="-apple-system, system-ui, 'Segoe UI', sans-serif">
    <text x="60" y="80" font-size="28" fill="${dim}" font-weight="500">ai-tracker</text>
    <text x="1140" y="80" font-size="22" fill="${accent}" font-weight="700" text-anchor="end" letter-spacing="2">${badge}</text>

    <text x="60" y="270" font-size="84" fill="${fg}" font-weight="700">${t}</text>
    <text x="60" y="330" font-size="32" fill="${dim}" font-weight="500">${sub}</text>

    ${bullets
      .map((b, i) => `<text x="60" y="${430 + i * 48}" font-size="30" fill="${fg}" font-weight="400">${b}</text>`)
      .join("\n    ")}

    <text x="60" y="590" font-size="22" fill="${dim}">ai-tracker-dxu.pages.dev</text>
  </g>
</svg>`;
}

export function svgResponse(svg: string): Response {
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400",
    },
  });
}

// PNG conversion via @resvg/resvg-js. Closes the LinkedIn / strict-scraper gap
// where SVG OG images aren't supported. Build-time only.
//
// Content-hash cache at tmp/png-cache/<sha256>.png so unchanged SVGs skip the
// ~400ms resvg render on subsequent builds. The cache is git-ignored; stale
// entries are inert (just disk).
export async function svgToPng(svg: string): Promise<Uint8Array> {
  const { createHash } = await import("node:crypto");
  const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const cacheRoot = resolve(fileURLToPath(import.meta.url), "../../..", "tmp", "png-cache");
  const hash = createHash("sha256").update(svg).digest("hex");
  const cachePath = join(cacheRoot, `${hash}.png`);
  if (existsSync(cachePath)) {
    return new Uint8Array(readFileSync(cachePath));
  }

  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
    background: "transparent",
  });
  const png = resvg.render().asPng();

  try {
    mkdirSync(cacheRoot, { recursive: true });
    writeFileSync(cachePath, png);
  } catch {
    /* cache best-effort; render still returned */
  }
  return png;
}

export async function pngResponse(svg: string): Promise<Response> {
  const png = await svgToPng(svg);
  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
