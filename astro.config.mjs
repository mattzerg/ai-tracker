import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://ai-tracker-dxu.pages.dev",
  trailingSlash: "never",
  build: {
    format: "file",
  },
  integrations: [sitemap()],
});
