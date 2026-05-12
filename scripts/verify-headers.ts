// Smoke-test that the deployed site actually serves the headers configured in
// public/_headers. CF Pages reads that file at deploy time; this verifies the
// rules made it through and the response wire matches expectations.
//
// Run: npm run verify:headers   (defaults to live deploy URL)
// Or:  BASE=https://staging.example npm run verify:headers

const BASE = (process.env.BASE ?? "https://ai-tracker-dxu.pages.dev").replace(/\/$/, "");

interface Check {
  path: string;
  expectHeaders: Record<string, RegExp>;
}

const CHECKS: Check[] = [
  {
    path: "/",
    expectHeaders: {
      "x-robots-tag": /max-image-preview:large/,
      "x-content-type-options": /nosniff/,
      "referrer-policy": /strict-origin-when-cross-origin/,
    },
  },
  {
    path: "/og/default.png",
    expectHeaders: {
      "x-robots-tag": /max-image-preview:large/,
      "cache-control": /max-age=86400/,
      "content-type": /image\/png/,
    },
  },
  {
    path: "/dump/all.json",
    expectHeaders: {
      "x-robots-tag": /max-image-preview:large/,
      "access-control-allow-origin": /\*/,
      "cache-control": /max-age=600/,
      "content-type": /application\/json/,
    },
  },
  {
    path: "/api/search.json",
    expectHeaders: {
      "access-control-allow-origin": /\*/,
      "cache-control": /max-age=600/,
      "content-type": /application\/json/,
    },
  },
  {
    // CF Pages serves .xml as application/xml regardless of upstream header —
    // functionally fine for RSS / Atom readers, so accept either.
    path: "/feed.xml",
    expectHeaders: {
      "cache-control": /max-age=900/,
      "content-type": /application\/(rss\+)?xml/,
    },
  },
  {
    path: "/atom.xml",
    expectHeaders: {
      "cache-control": /max-age=900/,
      "content-type": /application\/(atom\+)?xml/,
    },
  },
  {
    path: "/llms.txt",
    expectHeaders: {
      "access-control-allow-origin": /\*/,
      "cache-control": /max-age=900/,
    },
  },
];

let errors = 0;

async function check(c: Check): Promise<void> {
  const url = `${BASE}${c.path}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    console.error(`✗ ${c.path}: HTTP ${res.status}`);
    errors++;
    return;
  }
  const fails: string[] = [];
  for (const [k, rx] of Object.entries(c.expectHeaders)) {
    const v = res.headers.get(k) ?? "";
    if (!rx.test(v)) fails.push(`  ${k}: expected ${rx} · got "${v}"`);
  }
  if (fails.length) {
    console.error(`✗ ${c.path}`);
    for (const f of fails) console.error(f);
    errors += fails.length;
  } else {
    console.log(`✓ ${c.path}`);
  }
}

async function main() {
  console.log(`verify-headers against ${BASE}\n`);
  for (const c of CHECKS) await check(c);
  if (errors > 0) {
    console.error(`\n${errors} header issue(s).`);
    process.exit(1);
  }
  console.log(`\n✓ All ${CHECKS.length} URLs serve the expected headers.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
