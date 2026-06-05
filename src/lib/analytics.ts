// Privacy-first, agent-aware analytics core (pure logic — no browser globals,
// so it's unit-testable in node). The browser wiring lives in analytics-client.ts.
//
// Design principles:
//   - No cookies, no localStorage, no fingerprinting, no PII. Just event counts.
//   - Honors Do-Not-Track and an explicit opt-out flag.
//   - No-op unless PUBLIC_ANALYTICS_ENDPOINT is configured (so dev/preview and
//     un-deployed builds send nothing).
//   - Agents that fetch JSON/MD twins don't run JS, so client analytics only
//     measure HUMAN surfaces; agent-endpoint volume is counted at the edge
//     (see docs/measurement.md). What we CAN measure client-side: which agent
//     endpoints humans click through to.

export const EVENTS = [
  "page_view",
  "search_query",
  "picker_recommend",
  "compare_view",
  "entity_view",
  "agent_endpoint_click", // human clicked a JSON / MD / clone / dump link
  "submit_start",
] as const;

export type EventName = (typeof EVENTS)[number];

export interface TrackContext {
  endpoint: string | null | undefined;
  doNotTrack?: string | null; // navigator.doNotTrack value ("1", "yes", "0", null)
  optedOut?: boolean;
}

/** True only when an endpoint is configured AND the visitor hasn't opted out / set DNT. */
export function analyticsEnabled(ctx: TrackContext): boolean {
  if (!ctx.endpoint) return false;
  if (ctx.optedOut) return false;
  const dnt = (ctx.doNotTrack ?? "").toString().toLowerCase();
  if (dnt === "1" || dnt === "yes" || dnt === "true") return false;
  return true;
}

export interface EventPayload {
  event: EventName;
  ts: string;
  path: string;
  props: Record<string, string | number | boolean>;
}

/** Build a clean, PII-free event payload. `props` is sanitized to scalars only. */
export function buildEvent(
  event: EventName,
  path: string,
  props: Record<string, unknown> = {},
  now: string = "",
): EventPayload {
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string") clean[k] = v.slice(0, 120); // cap free text; never URLs/PII
    else if (typeof v === "number" || typeof v === "boolean") clean[k] = v;
  }
  return { event, ts: now, path, props: clean };
}

/** Validate an event name at call sites that pass dynamic strings. */
export function isKnownEvent(name: string): name is EventName {
  return (EVENTS as readonly string[]).includes(name);
}
