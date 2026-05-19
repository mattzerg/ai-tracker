import type { Model, Repo, Tool } from "../../schemas/index.ts";

export type SourceTrust = "authoritative" | "supplementary";

interface MergeOpts {
  /** Authoritative sources can overwrite curated values; supplementary ones (aggregators) only fill gaps. */
  trust: SourceTrust;
}

function unionStrings(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])]));
}

function pricingEqualByValues(
  a: Model["pricing"] | undefined | null,
  b: Model["pricing"] | undefined | null,
): boolean {
  if (!a || !b) return false;
  return (
    a.input_per_mtok === b.input_per_mtok &&
    a.output_per_mtok === b.output_per_mtok
  );
}

/** Merge a proposed model into an existing one. Existing curated fields win for supplementary sources. */
export function mergeModel(existing: Model, proposed: Model, opts: MergeOpts): Model {
  const auth = opts.trust === "authoritative";
  return {
    ...existing,
    // Name: keep existing curated form; supplementary sources never override.
    name: existing.name,
    // Released: prefer existing if it's already set; supplementary may fill gaps.
    released: existing.released ?? proposed.released,
    // Context: same — fill if missing.
    context_window: existing.context_window ?? proposed.context_window,
    output_window: existing.output_window ?? proposed.output_window,
    // Modalities: always union — multiple sources expose different modality info.
    modalities: unionStrings(existing.modalities, proposed.modalities) as Model["modalities"],
    // Pricing: if values match, keep existing as_of (avoid daily churn). Otherwise use proposed if authoritative,
    // else only adopt if existing has none.
    pricing:
      pricingEqualByValues(existing.pricing, proposed.pricing)
        ? existing.pricing
        : auth
          ? proposed.pricing ?? existing.pricing
          : existing.pricing ?? proposed.pricing,
    // License: authoritative sources can correct a stale curated value (e.g. supplementary
    // aggregator marked a proprietary model "open-weights"); supplementary only fills gaps.
    license: auth ? proposed.license ?? existing.license : existing.license ?? proposed.license,
    // Tags: union.
    tags: unionStrings(existing.tags, proposed.tags),
    // Sources: union — keep all attribution.
    sources: unionStrings(existing.sources, proposed.sources),
    // Status: keep existing unless authoritative.
    status: auth ? proposed.status : existing.status,
    // Links: shallow merge (proposed only fills missing keys).
    links: { ...proposed.links, ...existing.links },
  };
}

export function mergeTool(existing: Tool, proposed: Tool, opts: MergeOpts): Tool {
  const auth = opts.trust === "authoritative";
  return {
    ...existing,
    name: existing.name,
    released: existing.released ?? proposed.released,
    built_on_models: unionStrings(existing.built_on_models, proposed.built_on_models),
    pricing_tiers: auth && proposed.pricing_tiers.length ? proposed.pricing_tiers : existing.pricing_tiers,
    free_tier: existing.free_tier,
    modalities: unionStrings(existing.modalities, proposed.modalities) as Tool["modalities"],
    tags: unionStrings(existing.tags, proposed.tags),
    sources: unionStrings(existing.sources, proposed.sources),
    status: auth ? proposed.status : existing.status,
    links: { ...proposed.links, ...existing.links },
  };
}

export function mergeRepo(existing: Repo, proposed: Repo, opts: MergeOpts): Repo {
  const auth = opts.trust === "authoritative";
  return {
    ...existing,
    owner: existing.owner,
    name: existing.name,
    full_name: existing.full_name,
    description: auth ? proposed.description ?? existing.description : existing.description ?? proposed.description,
    category: auth ? proposed.category : existing.category,
    language: proposed.language ?? existing.language,
    license: proposed.license ?? existing.license,
    // GitHub is the source of truth for live repo counters even when the reader is supplementary.
    stars: proposed.stars ?? existing.stars,
    forks: proposed.forks ?? existing.forks,
    open_issues: proposed.open_issues ?? existing.open_issues,
    topics: unionStrings(existing.topics, proposed.topics),
    homepage: existing.homepage ?? proposed.homepage,
    repo_url: existing.repo_url,
    package_urls: unionStrings(existing.package_urls, proposed.package_urls),
    created_at: existing.created_at ?? proposed.created_at,
    pushed_at: proposed.pushed_at ?? existing.pushed_at,
    archived: proposed.archived ?? existing.archived,
    tags: unionStrings(existing.tags, proposed.tags),
    sources: unionStrings(existing.sources, proposed.sources),
  };
}
