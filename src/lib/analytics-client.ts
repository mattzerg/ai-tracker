// Browser entry for analytics — bundled by Astro via a <script> tag in Base.astro.
// Wires the pure core (analytics.ts) to the DOM: auto page_view, a global
// window.aitrack() for surfaces, and delegated agent-endpoint-click tracking.

import { analyticsEnabled, buildEvent, isKnownEvent, type EventName } from "./analytics.ts";

declare global {
  interface Window {
    aitrack?: (event: string, props?: Record<string, unknown>) => void;
  }
}

const ENDPOINT = import.meta.env.PUBLIC_ANALYTICS_ENDPOINT as string | undefined;

function send(event: EventName, props: Record<string, unknown> = {}): void {
  const ctx = {
    endpoint: ENDPOINT,
    doNotTrack: typeof navigator !== "undefined" ? navigator.doNotTrack : null,
    optedOut: typeof localStorage !== "undefined" && localStorage.getItem("aitr-no-analytics") === "1",
  };
  if (!analyticsEnabled(ctx)) return;
  const payload = buildEvent(event, location.pathname, props, new Date().toISOString());
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT!, body);
    } else {
      void fetch(ENDPOINT!, { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } });
    }
  } catch {
    /* analytics never breaks the page */
  }
}

export function initAnalytics(): void {
  // Public hook for surfaces: window.aitrack("search_query", {...})
  window.aitrack = (event, props) => {
    if (isKnownEvent(event)) send(event, props);
  };

  // Auto page view
  send("page_view");

  // Delegated agent-endpoint-click tracking: any link tagged data-agent-endpoint
  document.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.("[data-agent-endpoint]");
    if (el) send("agent_endpoint_click", { kind: el.getAttribute("data-agent-endpoint") || "unknown" });
  });
}
