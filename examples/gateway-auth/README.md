# Gateway Auth Example

Working example of the authorization proxy pattern from [AGENT-IDENTITY.md](../../docs/AGENT-IDENTITY.md).

Places an auth gateway between agents and robinhood-for-agents. The gateway verifies agent identity and enforces per-tool permissions before forwarding MCP requests.

> [!CAUTION]
> The included `UnsafeStructuralVerifier` is for **development only**. It trusts
> whatever the caller sends — any agent can self-assert any permissions. For
> production, implement the `AgentVerifier` interface with real verification
> (JWT, DID, ZKP, etc.). See [Custom Verifier](#custom-verifier) below.

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
robinhood-for-agents (:3000, internal only)
```

## Tool Permission Tiers

Matches the tiers from AGENT-IDENTITY.md:

| Tier | Tools | Required Permission |
|------|-------|---------------------|
| Read | `get-portfolio`, `get-watchlist`, `get-positions`, `get-holdings`, `search-stocks`, `get-stock-quote`, `get-stock-history`, `get-options-chain`, `get-news`, `get-orders` | `read` |
| Trade | `place-order`, `cancel-order` | `read` + `trade` |
| Account | `get-account`, `get-transfers` | `read` + `account` |
| Admin | All tools (including unmapped) | `admin` |

Unmapped tools are **denied by default**.

## Files

- `server.ts` — HTTP entrypoint (Bun.serve)
- `gateway.ts` — Auth logic with pluggable `AgentVerifier` interface
- `config.ts` — Tool-permission mapping and configuration
- `gateway.test.ts` — Unit tests
- `docker-compose.yml` — Run both services together
- `Dockerfile` — Gateway container image

## Quick Start

```bash
# Without Docker
cd examples/gateway-auth
bun install
bun run server.ts

# With Docker
cd examples/gateway-auth
docker compose up
```

Agents connect to the gateway on port 3001. The MCP server (port 3000) is internal only and not exposed to the host.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `3001` | Gateway listen port |
| `MCP_UPSTREAM` | `http://localhost:3000` | Upstream MCP server address |
| `AGENT_AUTH_ENABLED` | `false` | Enable identity verification |
| `AGENT_VERIFIER` | `structural` | Verifier type (`structural` = dev only) |
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

The `X-Agent-Credential` header carries a JSON string:

```json
{
  "agentId": "my-trading-bot",
  "permissions": ["read", "trade"],
  "expiry": 1735689600
}
```

- `agentId` — unique agent identifier (string, required)
- `permissions` — array of permission strings: `read`, `trade`, `account`, `admin`
- `expiry` — optional Unix timestamp in **seconds** (not milliseconds)

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
