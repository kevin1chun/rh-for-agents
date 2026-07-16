# Gateway Auth Example

Working implementation of the authorization proxy pattern from [AGENT-IDENTITY.md](./AGENT-IDENTITY.md).

Places an auth gateway between agents and robinhood-for-agents. The gateway verifies agent identity and enforces per-tool permissions before forwarding MCP requests.

> [!CAUTION]
> The included `UnsafeStructuralVerifier` is for **development only**. It trusts
> whatever the caller sends — any agent can self-assert any permissions.
> The gateway **refuses to start** with auth enabled and `structural` verifier.
> For production, use `shared-secret` (HMAC-SHA256) or implement the
> `AgentVerifier` interface with real verification (JWT, DID, ZKP, etc.).
> See [Custom Verifier](#custom-verifier) below.

## Architecture

```
Agent (with X-Agent-Credential header)
  |
  v
Auth Gateway (:3001)
  - verify identity via AgentVerifier
  - check tool permissions
  - log decision (structured console output)
  |
  v
MCP server over HTTP (:3000, internal only)
```

> [!NOTE]
> The gateway forwards MCP JSON-RPC over **HTTP** to `MCP_UPSTREAM`. The
> robinhood-for-agents MCP server itself speaks **stdio**, not HTTP — to place
> it behind this gateway, run it behind a stdio↔HTTP MCP bridge (or point
> `MCP_UPSTREAM` at any MCP server that accepts JSON-RPC over HTTP POST).
> The gateway's auth logic is independent of the upstream and is what this
> example demonstrates.

## Tool Permission Tiers

Concrete default mapping used by the gateway (inspired by the illustrative tiers in AGENT-IDENTITY.md, adapted to actual tool names):

| Tier | Tools | Required Permission |
|------|-------|---------------------|
| Read | `robinhood_get_portfolio`, `robinhood_get_stock_quote`, `robinhood_get_historicals`, `robinhood_get_news`, `robinhood_search`, `robinhood_get_movers`, `robinhood_get_crypto`, `robinhood_get_options`, `robinhood_get_orders`, `robinhood_get_order_status`, `robinhood_check_session` | `read` |
| Trade | `robinhood_place_stock_order`, `robinhood_place_option_order`, `robinhood_place_crypto_order`, `robinhood_cancel_order` | `read` + `trade` |
| Account | `robinhood_get_account`, `robinhood_get_accounts` | `read` + `account` |
| Admin-only | `robinhood_browser_login` | `admin` |
| Admin | All tools (including unmapped) | `admin` |

Unmapped tools are **denied by default**.

## Files

All source lives in [`examples/gateway-auth/`](../examples/gateway-auth/):

- `server.ts` — HTTP entrypoint (Bun.serve)
- `gateway.ts` — Auth logic with pluggable `AgentVerifier` interface
- `config.ts` — Tool-permission mapping and configuration
- `gateway.test.ts` — Unit tests
- `docker-compose.yml` — Gateway + a placeholder upstream service (supply your own MCP-over-HTTP image)
- `Dockerfile` — Gateway container image

## Quick Start

```bash
# Without Docker — starts the gateway only; point MCP_UPSTREAM at your
# HTTP-reachable MCP server (default: http://localhost:3000)
cd examples/gateway-auth
bun install
bun run server.ts

# With Docker — first replace the placeholder `mcp` image in
# docker-compose.yml with your MCP-over-HTTP image (see note above)
cd examples/gateway-auth
docker compose up
```

Agents connect to the gateway on port 3001. The upstream MCP server (port 3000) is internal only and not exposed to the host.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `3001` | Gateway listen port |
| `MCP_UPSTREAM` | `http://localhost:3000` | Upstream MCP server address |
| `AGENT_AUTH_ENABLED` | `false` | Enable identity verification |
| `AGENT_VERIFIER` | `structural` | Verifier type: `structural` (dev only, blocked when auth enabled), `shared-secret` (HMAC-SHA256) |
| `AGENT_AUTH_SECRET` | — | HMAC secret for `shared-secret` verifier (min 32 chars). Generate with `openssl rand -hex 32` |
| `AGENT_AUTH_DEFAULT_POLICY` | `deny` | Policy for unmapped tools: `deny` or `allow` |
| `ROBINHOOD_ACCESS_TOKEN` | — | Robinhood API token (for MCP server) |

> [!IMPORTANT]
> For any non-localhost deployment, place a TLS-terminating reverse proxy
> (nginx, Caddy, etc.) in front of the gateway. Credentials flow in cleartext
> over plain HTTP.

## Testing

```bash
cd examples/gateway-auth
bun test
```

## Credential Format

The credential format depends on the verifier.

### `shared-secret` (HMAC-SHA256, recommended)

The `X-Agent-Credential` header carries a JSON string with an HMAC signature:

```json
{
  "agentId": "my-trading-bot",
  "permissions": ["read", "trade"],
  "expiry": 1735689600,
  "hmac": "<HMAC-SHA256 of agentId+permissions+expiry, hex-encoded>"
}
```

The HMAC is computed over the canonical JSON `{"agentId":"...","expiry":...,"permissions":[...]}` (keys sorted). Only the gateway and the credential issuer should hold `AGENT_AUTH_SECRET` — if an agent has the secret, it can mint its own credentials with any permissions.

### `structural` (development only, auth must be disabled)

Plain JSON without signature — trusts whatever the caller sends:

```json
{
  "agentId": "my-trading-bot",
  "permissions": ["read", "trade"],
  "expiry": 1735689600
}
```

### Common fields

- `agentId` — unique agent identifier (string, required)
- `permissions` — array of permission strings: `read`, `trade`, `account`, `admin`
- `expiry` — Unix timestamp in **seconds** (required for `shared-secret`)

## Custom Verifier

The gateway uses a pluggable `AgentVerifier` interface. Replace `UnsafeStructuralVerifier` with your own:

```typescript
import type { AgentVerifier, VerificationResult } from "./gateway";

class JWTVerifier implements AgentVerifier {
  async verify(credential: string): Promise<VerificationResult> {
    // Verify JWT signature, check claims, extract permissions
    const payload = verifyJWT(credential, publicKey);
    return {
      verified: true,
      agentId: payload.sub,
      permissions: payload.permissions,
    };
  }
}
```

Register it in `server.ts` or extend the `createVerifier` factory.
