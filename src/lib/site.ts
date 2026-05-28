export function requireSite(site: URL | undefined): URL {
  if (!site) throw new Error("Astro.site must be configured for canonical URLs.");
  return site;
}
