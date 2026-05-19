import type { APIRoute, GetStaticPaths } from "astro";
import { eventsForEntity, loadRepos } from "../../lib/data.ts";
import type { Repo } from "../../../schemas/index.ts";

export const getStaticPaths: GetStaticPaths = () =>
  loadRepos().map((r) => ({ params: { id: r.id }, props: { repo: r } }));

function render(repo: Repo): string {
  const events = eventsForEntity(repo.id);
  const lines: string[] = [];
  lines.push(`# ${repo.full_name}`);
  lines.push("");
  lines.push(`**Category:** ${repo.category}`);
  lines.push(`**Language:** ${repo.language ?? "n/a"}`);
  lines.push(`**License:** ${repo.license ?? "n/a"}`);
  lines.push(`**Stars:** ${repo.stars ?? "n/a"}`);
  lines.push(`**Forks:** ${repo.forks ?? "n/a"}`);
  lines.push(`**Created:** ${repo.created_at ?? "n/a"}`);
  lines.push(`**Pushed:** ${repo.pushed_at ?? "n/a"}`);
  lines.push(`**Archived:** ${repo.archived ? "yes" : "no"}`);
  if (repo.description) lines.push(`**Description:** ${repo.description}`);
  lines.push("");
  lines.push("## Links");
  lines.push(`- GitHub: ${repo.repo_url}`);
  if (repo.homepage) lines.push(`- Homepage: ${repo.homepage}`);
  for (const u of repo.package_urls) lines.push(`- Package: ${u}`);
  if (repo.topics.length || repo.tags.length) {
    lines.push("");
    lines.push("## Topics");
    lines.push(Array.from(new Set([...repo.topics, ...repo.tags])).join(", "));
  }
  lines.push("");
  lines.push("## Timeline");
  if (events.length === 0) {
    lines.push("");
    lines.push("_No events recorded yet._");
  } else {
    for (const e of events) lines.push(`- ${e.date} — **${e.type}** — ${e.summary} ([source](${e.source}))`);
  }
  lines.push("");
  lines.push("## Sources");
  for (const s of repo.sources) lines.push(`- ${s}`);
  lines.push("");
  return lines.join("\n");
}

export const GET: APIRoute = ({ props }) => {
  const repo = (props as { repo: Repo }).repo;
  return new Response(render(repo), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
