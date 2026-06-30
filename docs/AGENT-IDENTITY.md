# Agent Identity and Per-Tool Authorization

SECURITY.md covers how robinhood-for-agents protects OAuth tokens at rest.
This guide covers a different question: when multiple agents or third-party
tools connect to your MCP server, how do you verify which agent is acting
and restrict what tools it can call?

## When this matters

- Multiple agents share the same user's Robinhood credentials
- A third-party tool or wrapper connects to your MCP server
- You want to attribute trades to specific agent software for debugging or operational visibility
- You want to restrict some agents to read-only access

## Pattern: authorization proxy

Place a reverse proxy between agents and robinhood-for-agents. The proxy
verifies agent credentials and enforces a per-tool permission policy before
forwarding requests. robinhood-for-agents does not need code changes.

```
Agent → Authorization Proxy (verify + enforce) → robinhood-for-agents
```

The proxy should:
1. Verify the agent's identity (signed attestation, API key, certificate, etc.)
2. Check the requested tool against a permission policy
3. Reject unauthorized or replayed requests
4. Log the decision for troubleshooting and accountability

## Example tool permission tiers

Tools in robinhood-for-agents have different risk levels. As an illustrative
starting point, you might group them like this:

| Tier | Example tools | Rationale |
|------|--------------|-----------|
| Read-only | `get_portfolio`, `get_stock_quote`, `search` | No side effects |
| Write | `cancel_order` | Modifies state but does not create exposure |
| Trade | `place_stock_order`, `place_option_order` | Creates financial exposure |
| Blocked | `browser_login` | Should never be triggered by a remote agent |

> **This is illustrative, not exhaustive.** Check `src/server/tools/` for
> the current tool list and review each tool's risk level before building
> your policy. Tools may be added or renamed between versions.

An agent authorized for "Read-only" should not be able to call
`place_stock_order`. The proxy enforces this before the request reaches the
MCP server.

## Implementation options

Several approaches can implement this pattern:

- **API gateway with tool-name routing** (e.g., nginx + Lua, Envoy, Kong):
  inspect the JSON-RPC `params.name` field and enforce allow/deny rules
  per agent identity.
- **MCP-aware auth proxy** (e.g., [@bolyra/gateway](https://github.com/bolyra/bolyra/tree/main/integrations/gateway)):
  a reverse proxy purpose-built for MCP servers with per-tool policy
  enforcement and decision logging.
- **Custom middleware**: wrap the MCP server's HTTP transport with
  authentication and authorization checks.

The choice depends on your deployment topology and trust model.

For a working example using this pattern with robinhood-for-agents, see the
[Gateway Auth example](./GATEWAY-AUTH.md).

## What the proxy should log

For each `tools/call` request, the proxy should record:
- Agent identity (however you identify agents)
- Tool name requested
- Decision (allowed or denied)
- Timestamp
- Reason for denial (if applicable)

This creates a record that answers "which software placed this trade?"

## Relationship to SECURITY.md

| Layer | Protects | Documented in |
|-------|----------|---------------|
| Token storage | User's OAuth credentials at rest | [SECURITY.md](./SECURITY.md) |
| Agent authorization | Which agent can call which tools | This guide |

Both layers are independent. You can use either or both depending on your
threat model.
