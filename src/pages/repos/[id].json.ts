import type { APIRoute, GetStaticPaths } from "astro";
import { eventsForEntity, loadRepos } from "../../lib/data.ts";

export const getStaticPaths: GetStaticPaths = () =>
  loadRepos().map((r) => ({ params: { id: r.id }, props: { repo: r } }));

export const GET: APIRoute = ({ props }) => {
  const repo = (props as { repo: ReturnType<typeof loadRepos>[number] }).repo;
  const body = JSON.stringify({ ...repo, events: eventsForEntity(repo.id) }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
