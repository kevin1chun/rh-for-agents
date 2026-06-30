/**
 * HTTP entrypoint for the auth gateway.
 *
 * Proxies MCP JSON-RPC requests to the upstream server after verifying
 * agent identity and tool permissions via X-Agent-Credential header.
 */

import { configFromEnv } from "./config";
import { AuthGateway, createVerifier } from "./gateway";

const config = configFromEnv();
const verifier = createVerifier(process.env.AGENT_VERIFIER || "structural");
const gateway = new AuthGateway(config, verifier);

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, X-Agent-Credential",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      },
    });
  }

  // Health check
  if (req.method === "GET" && new URL(req.url).pathname === "/health") {
    return Response.json({ status: "ok", auth: config.authEnabled });
  }

  // Decision log (admin endpoint)
  if (req.method === "GET" && new URL(req.url).pathname === "/decisions") {
    return Response.json(gateway.getDecisions());
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // Parse JSON-RPC to extract tool name
  let body: { method?: string; params?: { name?: string }; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }

  // Only gate tools/call — pass through other MCP methods (initialize, list, etc.)
  if (body.method === "tools/call" && body.params?.name) {
    const credential = req.headers.get("x-agent-credential") ?? undefined;
    const denial = await gateway.authorize(credential, body.params.name);
    if (denial) {
      return Response.json(
        {
          jsonrpc: "2.0",
          id: (body as Record<string, unknown>).id ?? null,
          error: { code: -32600, message: denial },
        },
        { status: 403 },
      );
    }
  }

  // Forward to upstream
  try {
    const upstream = await fetch(config.upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const upstreamBody = await upstream.text();
    return new Response(upstreamBody, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[gateway] upstream error:", err);
    return Response.json(
      {
        jsonrpc: "2.0",
        id: (body as Record<string, unknown>).id ?? null,
        error: { code: -32603, message: "Upstream unavailable" },
      },
      { status: 502 },
    );
  }
}

console.log(`[gateway] listening on :${config.port}`);
console.log(`[gateway] upstream: ${config.upstream}`);
console.log(`[gateway] auth: ${config.authEnabled ? "enabled" : "disabled"}`);
console.log(`[gateway] default policy: ${config.defaultPolicy}`);

Bun.serve({
  port: config.port,
  fetch: handleRequest,
});
