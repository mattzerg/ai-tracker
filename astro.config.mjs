import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

function withHttpsScheme(value) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const rawSite =
  process.env.SITE_URL ||
  (process.env.CF_PAGES_URL ? withHttpsScheme(process.env.CF_PAGES_URL) : "http://localhost:4321");

function normalizeSite(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("[astro.config] SITE_URL must be an absolute http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("[astro.config] SITE_URL must use http or https.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("[astro.config] SITE_URL must be an origin without a path, query, or hash.");
  }
  return url.origin;
}

export default defineConfig({
  site: normalizeSite(rawSite),
  output: "static",
  trailingSlash: "never",
  build: {
    format: "file",
  },
  integrations: [sitemap()],
});
