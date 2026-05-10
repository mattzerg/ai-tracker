import type { APIRoute, GetStaticPaths } from "astro";
import { eventsForEntity, loadTools } from "../../lib/data.ts";

export const getStaticPaths: GetStaticPaths = () =>
  loadTools().map((t) => ({ params: { id: t.id }, props: { tool: t } }));

export const GET: APIRoute = ({ props }) => {
  const tool = (props as { tool: ReturnType<typeof loadTools>[number] }).tool;
  const body = JSON.stringify({ ...tool, events: eventsForEntity(tool.id) }, null, 2);
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
