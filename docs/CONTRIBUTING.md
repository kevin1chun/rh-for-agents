# Contributing

## Adding a New MCP Tool

1. Identify which `src/server/tools/` file it belongs in (or create a new one)
2. Import `{ getAuthenticatedRh, structured, textError }` from `./_helpers.js`
3. Register with `server.registerTool(name, { title, description, inputSchema, outputSchema, annotations }, handler)`
4. Define `inputSchema` with Zod — MCP uses these for the tool schema. Set `annotations.readOnlyHint: true` for reads; for writes set `readOnlyHint: false` plus honest `destructiveHint`/`idempotentHint`
5. Define `outputSchema` for the success shape. Type only the envelope keys your handler constructs; keep nested Robinhood API passthrough data loose (`z.looseObject({})` / `z.unknown()`) so upstream field drift can't turn into a runtime validation failure — never use a bare `z.record()` as a top-level output schema (the installed SDK silently drops it)
6. Wrap the handler body in try/catch, return `structured({ ... })` on success, `textError(String(e))` on failure
7. If a new file, import and call its `register*Tools(server)` in `server.ts`
8. Add tests in `__tests__/server/tools.test.ts`; if the tool's output schema is nontrivial, also exercise it in `__tests__/server/tools-realsdk.test.ts` (runs tools through the real MCP SDK over an in-memory transport — the mocked tests can't catch SDK-level schema issues)

Example:

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getAuthenticatedRh, structured, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;

export function registerNewTools(server: McpServer): void {
  server.registerTool(
    "robinhood_new_tool",
    {
      title: "New Tool",
      description: "Tool description shown to agents.",
      inputSchema: {
        param: z.string().describe("Parameter description."),
      },
      outputSchema: {
        data: z.unknown().describe("Result of someMethod (API passthrough)."),
      },
      annotations: READ_ONLY,
    },
    async ({ param }) => {
      try {
        const rh = await getAuthenticatedRh();
        const result = await rh.someMethod(param);
        return structured({ data: result });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
```

## Extending the Skill

There is a single unified skill, `skills/robinhood-for-agents/`, with three-layer progressive disclosure (`SKILL.md` router → domain files → `reference.md`/`client-api.md`). To cover a new domain:

1. Add a domain file (e.g. `skills/robinhood-for-agents/<domain>.md`) with step-by-step workflow instructions and code patterns
2. Add a routing row for it in `SKILL.md`'s Routing table (intent, file, example triggers)
3. Document any new MCP tool parameters in `reference.md` and new client methods in `client-api.md`
4. Keep `SKILL.md` compact — it is loaded on every trigger; details belong in the domain files

## Adding Client Methods

1. Define a Zod schema in `src/client/types.ts` — keep it tolerant of extra fields (`z.looseObject({...})` or `.catchall(z.unknown())`) so upstream field drift can't break parsing
2. Add a URL builder in `src/client/urls.ts` if needed
3. Implement the method in `src/client/client.ts`:
   - Use `parseOne(Schema, data)` or `parseArray(Schema, data)` for return values
   - Use typed return signatures (e.g. `Promise<Quote[]>`, not `Promise<unknown[]>`)
4. Export the new type from `src/client/index.ts`
5. Add tests in `__tests__/client/` using `vi.mock("../../src/client/http.js")`

## Testing

```bash
npx vitest run          # All tests
npx vitest run --watch  # Watch mode
```

All tests mock the HTTP layer via `vi.mock()` — no real API calls. Use `vitest` (not `bun test`) for correct module isolation.

When mocking `http.js`, use `importOriginal` to preserve `parseOne`/`parseArray`:

```typescript
vi.mock("../../src/client/http.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/client/http.js")>();
  return {
    ...actual,
    requestGet: vi.fn(),
    requestPost: vi.fn(),
  };
});
```

## Git Workflow

1. Fork the repo and create a branch from `main`
2. Branch naming: `feat/description`, `fix/description`, or `docs/description`
3. Make your changes and ensure all checks pass locally:
   ```bash
   bun run check && bun run typecheck && npx vitest run
   ```
4. Write clear commit messages: `feat: add new tool`, `fix: handle null margin`, `docs: update README`
5. Open a pull request against `main`
6. Fill out the PR template (safety checklist + testing)

## Examples

Runnable examples live in `examples/` and are linted and formatted with the rest of the codebase (`bun run check`). They are not type-checked by `bun run typecheck`, because they import the package by name (`robinhood-for-agents`), which resolves through `dist/` — run `bun run build` first if you want your editor to resolve them.

An example that can place an order must be **dry-run by default** and require an explicit flag (e.g. `--place`) to submit anything real. Say so in the file header.

## Safety Checklist

Before adding any new tool or skill:
- [ ] Does it expose fund transfer or bank operations? (If yes, BLOCK it)
- [ ] Does it place orders? (If yes, require explicit parameters, add to high-risk tier)
- [ ] Could it cause bulk operations? (If yes, consider blocking or adding safeguards)
- [ ] Could a mis-parsed request create *unbounded* risk (a short, a naked option)? (If yes, make the risky path its own explicit parameter value — never a default or a near-synonym of a safe one)
- [ ] Update ACCESS_CONTROLS.md with the new operation
