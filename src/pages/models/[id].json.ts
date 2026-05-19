import type { APIRoute, GetStaticPaths } from "astro";
import { eventsForEntity, loadModels } from "../../lib/data.ts";

export const getStaticPaths: GetStaticPaths = () =>
  loadModels().map((m) => ({ params: { id: m.id }, props: { model: m } }));

export const GET: APIRoute = ({ props }) => {
  const model = (props as { model: ReturnType<typeof loadModels>[number] }).model;
  const apiId = model.id.replace(`${model.provider}__`, "");
  const body = JSON.stringify(
    {
      ...model,
      developer: {
        api_style_id: apiId,
        docs: model.links.docs ?? null,
        homepage: model.links.homepage ?? null,
        pricing_as_of: model.pricing?.as_of ?? null,
      },
      events: eventsForEntity(model.id),
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
};
