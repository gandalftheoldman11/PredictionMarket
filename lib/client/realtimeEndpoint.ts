const WEBSOCKET_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

export function realtimeEndpoint(
  configured: string | undefined,
  pageHref: string,
): string {
  const page = new URL(pageHref);
  const endpoint = configured
    ? new URL(configured, page)
    : new URL("/v1/ws", page);
  if (!WEBSOCKET_PROTOCOLS.has(endpoint.protocol)) {
    throw new Error("Realtime URL must use HTTP or WebSocket transport");
  }
  endpoint.protocol =
    page.protocol === "https:" ||
    endpoint.protocol === "https:" ||
    endpoint.protocol === "wss:"
      ? "wss:"
      : "ws:";
  return endpoint.toString();
}
