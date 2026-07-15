/**
 * Watchlist tools for Robinhood.
 *
 * Reads (`get_*`) are read-only. Writes (`add`/`remove`) are the first
 * non-order writes in the server and follow the tier-2 write policy (see
 * CLAUDE.md): mirror the official contract, confirm-before-calling in the
 * description, honest MCP annotations, and structurally single-target /
 * single-operation primitives (the client builds the bulk wire-map internally,
 * so multi-list or mixed create/delete writes are never expressible here).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { RobinhoodClient } from "../../client/client.js";
import type { WatchlistItemRef, WatchlistObjectType } from "../../client/index.js";
import { getAuthenticatedRh, text, textError } from "./_helpers.js";

const READ_ONLY = { readOnlyHint: true } as const;
// Adds are non-destructive + idempotent (re-adding is a no-op). Removes are
// destructive but idempotent (removing an absent item is a no-op).
const ADD_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
} as const;
const REMOVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
} as const;
// Create makes a new list each call (not idempotent, not destructive).
const CREATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
} as const;
// Update overwrites the named fields (destructive to prior metadata) but is
// idempotent (re-applying the same values changes nothing).
const UPDATE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
} as const;
// Follow/unfollow only change whether a curated list appears in the user's
// sidebar — the list itself is untouched (non-destructive) and re-applying is a
// no-op (idempotent). Same shape suits add_option (deduped → idempotent).
const FOLLOW_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
} as const;

/** Max option_ids per add/remove call — bounds the non-atomic partial-failure surface. */
const MAX_OPTION_IDS = 20;

/**
 * Parse a single-leg options-watchlist `strategy_code` (`"{option_id}_L1"` /
 * `"{option_id}_S1"`) into its underlying option instrument id and leg
 * direction. Returns null for anything else (multi-leg strategies, unknown
 * formats) — an option instrument id is a hyphenated UUID with no underscores,
 * so a single leg splits cleanly into exactly two parts.
 */
function parseStrategyCode(
  code?: string | null,
): { optionId: string; positionType: "long" | "short" } | null {
  if (!code) return null;
  const parts = code.split("_");
  if (parts.length !== 2) return null;
  const [optionId, suffix] = parts;
  if (!optionId) return null;
  if (suffix === "L1") return { optionId, positionType: "long" };
  if (suffix === "S1") return { optionId, positionType: "short" };
  return null;
}

/** Shared input shape for add/remove: list_id + exactly one asset-id array. */
const writeShape = {
  list_id: z.uuid().describe("UUID of the watchlist to modify (from robinhood_get_watchlists)."),
  symbols: z
    .array(z.string())
    .nullish()
    .describe("Stock/ETF symbols, e.g. ['AAPL','NVDA']. Mutually exclusive with the id arrays."),
  currency_pair_ids: z
    .array(z.uuid())
    .nullish()
    .describe("Crypto currency-pair UUIDs. Mutually exclusive with symbols and index_ids."),
  index_ids: z
    .array(z.uuid())
    .nullish()
    .describe(
      "Market-index UUIDs (from robinhood_get_indexes). Mutually exclusive with the others.",
    ),
};

type Selection =
  | { kind: "symbols"; values: string[] }
  | { kind: "index_ids"; values: string[] }
  | { kind: "currency_pair_ids"; values: string[] };

/** Enforce the official "exactly one of three, non-empty" contract. */
function pickSelection(
  symbols?: string[] | null,
  currency_pair_ids?: string[] | null,
  index_ids?: string[] | null,
): Selection {
  const chosen: Selection[] = [];
  if (symbols?.length) chosen.push({ kind: "symbols", values: symbols });
  if (currency_pair_ids?.length)
    chosen.push({ kind: "currency_pair_ids", values: currency_pair_ids });
  if (index_ids?.length) chosen.push({ kind: "index_ids", values: index_ids });
  if (chosen.length !== 1) {
    throw new Error(
      "Provide exactly one non-empty array of: symbols, currency_pair_ids, or index_ids.",
    );
  }
  return chosen[0] as Selection;
}

type ResolvedItem = { object_type: WatchlistObjectType; object_id: string; symbol?: string };

/**
 * Resolve an add-selection to write refs, failing the whole call if ANY item is
 * unresolvable (all-or-nothing — a partial mutation from a mid-batch failure is
 * the worst outcome). Symbols go through exact-match instrument resolution; raw
 * index / currency-pair ids are validated against the real catalogs so a
 * wrong-typed UUID can't slip into a corrupt list entry.
 */
async function resolveAddItems(rh: RobinhoodClient, sel: Selection): Promise<ResolvedItem[]> {
  if (sel.kind === "symbols") {
    const insts = await Promise.all(sel.values.map((s) => rh.resolveInstrumentBySymbol(s)));
    return insts.map((i) => ({ object_type: "instrument", object_id: i.id, symbol: i.symbol }));
  }
  if (sel.kind === "index_ids") {
    const valid = new Set((await rh.getIndexInstruments()).map((i) => i.id));
    const bad = sel.values.filter((id) => !valid.has(id));
    if (bad.length) {
      throw new Error(
        `Not valid index ids: ${bad.join(", ")}. Find index ids via robinhood_get_indexes.`,
      );
    }
    return sel.values.map((id) => ({ object_type: "index", object_id: id }));
  }
  const valid = new Set((await rh.getCurrencyPairs()).map((p) => p.id));
  const bad = sel.values.filter((id) => !valid.has(id));
  if (bad.length) {
    throw new Error(`Not valid currency-pair ids: ${bad.join(", ")}.`);
  }
  return sel.values.map((id) => ({ object_type: "currency_pair", object_id: id }));
}

export function registerWatchlistTools(server: McpServer): void {
  server.tool(
    "robinhood_get_watchlists",
    "List your own Robinhood watchlists (custom lists). Returns each list's metadata including its `id` (UUID) — pass that id to robinhood_get_watchlist_items, robinhood_add_to_watchlist, or robinhood_remove_from_watchlist. Does not include the lists' items. For Robinhood-curated lists, use robinhood_get_popular_watchlists.",
    {},
    READ_ONLY,
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const watchlists = await rh.getWatchlists();
        return text({ count: watchlists.length, watchlists });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_watchlist_items",
    "List the items in a watchlist by list_id. Items are enriched with `symbol` and `name`; `object_type` distinguishes stocks/ETFs (instrument), market indexes (index), and crypto pairs (currency_pair). Does not return live prices — call robinhood_get_stock_quote for those. For the options watchlist use robinhood_get_option_watchlist instead. An unknown list_id returns an error.",
    {
      list_id: z
        .uuid()
        .describe(
          "UUID of the watchlist (from robinhood_get_watchlists or _get_popular_watchlists).",
        ),
    },
    READ_ONLY,
    async ({ list_id }) => {
      try {
        const rh = await getAuthenticatedRh();
        const items = await rh.getWatchlistItems(list_id);
        return text({
          list_id,
          count: items.length,
          items: items.map((it) => ({
            object_id: it.object_id,
            object_type: it.object_type,
            symbol: it.symbol ?? null,
            name: it.name ?? null,
          })),
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_popular_watchlists",
    "Discover Robinhood-curated watchlists (e.g. '100 Most Popular', 'Daily Movers'). Returns each list's metadata including its `id` (UUID); pass an id to robinhood_get_watchlist_items to see its members. Paginated results are fully collected.",
    {},
    READ_ONLY,
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const watchlists = await rh.getPopularWatchlists();
        return text({ count: watchlists.length, watchlists });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_get_option_watchlist",
    "List the single-leg option contracts on your options watchlist. Each entry has the underlying (chain_symbol), a human name, its watchlist object_id, and the option_id you'd pass to robinhood_remove_option_from_watchlist. Multi-leg strategies (e.g. from app-side order placement) are listed with a null option_id and can't be modified here — view those in the Robinhood app. For equity/index/crypto watchlists use robinhood_get_watchlist_items instead.",
    {},
    READ_ONLY,
    async () => {
      try {
        const rh = await getAuthenticatedRh();
        const list = await rh.getOptionWatchlist();
        if (!list) {
          return text({
            contracts: [],
            count: 0,
            note: "No options watchlist found on this account.",
          });
        }
        const contracts = (await rh.getOptionWatchlistContracts()).map((c) => {
          const parsed = parseStrategyCode(c.strategy_code);
          return {
            object_id: c.object_id,
            option_id: parsed?.optionId ?? null,
            position_type: parsed?.positionType ?? null,
            single_leg: parsed !== null,
            chain_symbol: c.chain_symbol ?? null,
            strategy: c.strategy ?? null,
            name: c.name ?? null,
          };
        });
        const multiLeg = contracts.filter((c) => !c.single_leg).length;
        const note =
          contracts.length === 0
            ? "The options watchlist is currently empty."
            : multiLeg > 0
              ? `Single-leg contracts expose an option_id for robinhood_remove_option_from_watchlist. ${multiLeg} multi-leg strateg${multiLeg === 1 ? "y is" : "ies are"} present with a null option_id — view/modify those in the Robinhood app.`
              : "Single-leg option contracts. Use option_id with robinhood_remove_option_from_watchlist.";
        return text({ count: contracts.length, contracts, note });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_create_watchlist",
    "Create a new (empty) watchlist for the user. Returns the created list including its new `id` (use that id with robinhood_add_to_watchlist to populate it). CONFIRM WITH THE USER before calling — this creates a list on the user's account. To add symbols, follow up with robinhood_add_to_watchlist.",
    {
      display_name: z.string().min(1).describe("The list's name (shown to the user)."),
      display_description: z
        .string()
        .nullish()
        .describe("Optional one-line description for the list."),
      icon_emoji: z.string().nullish().describe("Optional emoji shown next to the list name."),
    },
    CREATE_ANNOTATIONS,
    async ({ display_name, display_description, icon_emoji }) => {
      try {
        const rh = await getAuthenticatedRh();
        const list = await rh.createWatchlist(display_name, {
          displayDescription: display_description ?? undefined,
          iconEmoji: icon_emoji ?? undefined,
        });
        return text({
          operation: "created",
          list,
          note: "Watchlist created (empty). Add items with robinhood_add_to_watchlist using the returned list id.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_update_watchlist",
    "Update a watchlist's own metadata — its name, description, or emoji. Provide the list_id and at least one field to change; omitted fields are left unchanged. This does NOT add or remove items (use robinhood_add_to_watchlist / robinhood_remove_from_watchlist for those). CONFIRM WITH THE USER before calling — this mutates the user's watchlist.",
    {
      list_id: z
        .uuid()
        .describe("UUID of the watchlist to update (from robinhood_get_watchlists)."),
      display_name: z.string().min(1).nullish().describe("New name for the list."),
      display_description: z.string().nullish().describe("New description for the list."),
      icon_emoji: z.string().nullish().describe("New emoji for the list."),
    },
    UPDATE_ANNOTATIONS,
    async ({ list_id, display_name, display_description, icon_emoji }) => {
      try {
        const rh = await getAuthenticatedRh();
        const list = await rh.updateWatchlist(list_id, {
          displayName: display_name ?? undefined,
          displayDescription: display_description ?? undefined,
          iconEmoji: icon_emoji ?? undefined,
        });
        return text({ operation: "updated", list_id, list });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_add_to_watchlist",
    "Add items to one of your watchlists. Provide exactly one of: symbols (stocks/ETFs), currency_pair_ids (crypto), or index_ids (market indexes) — mutually exclusive. Already-present items are no-ops. For options use robinhood_add_option_to_watchlist. CONFIRM WITH THE USER before calling — this mutates the user's watchlist.",
    writeShape,
    ADD_ANNOTATIONS,
    async ({ list_id, symbols, currency_pair_ids, index_ids }) => {
      try {
        const rh = await getAuthenticatedRh();
        const sel = pickSelection(symbols, currency_pair_ids, index_ids);
        const resolved = await resolveAddItems(rh, sel);
        const refs: WatchlistItemRef[] = resolved.map((r) => ({
          object_type: r.object_type,
          object_id: r.object_id,
        }));
        await rh.updateWatchlistItems(list_id, "create", refs);
        return text({
          list_id,
          operation: "add",
          ensured_present: resolved,
          note: "Items ensured present on the list (already-present items are no-ops; the API echoes the request rather than the new list state).",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_remove_from_watchlist",
    "Remove items from one of your watchlists. Provide exactly one of: symbols (stocks/ETFs), currency_pair_ids (crypto), or index_ids (market indexes) — mutually exclusive. Items not on the list are reported as not_present (not an error). CONFIRM WITH THE USER before calling — this mutates the user's watchlist.",
    writeShape,
    REMOVE_ANNOTATIONS,
    async ({ list_id, symbols, currency_pair_ids, index_ids }) => {
      try {
        const rh = await getAuthenticatedRh();
        const sel = pickSelection(symbols, currency_pair_ids, index_ids);
        // Match against the list's actual (enriched) members so we delete the
        // exact object_id that's listed — dodging stale-instrument-id no-ops —
        // and can report per-item removed vs. not_present truthfully.
        const present = await rh.getWatchlistItems(list_id);
        const removeRefs: WatchlistItemRef[] = [];
        const removed: ResolvedItem[] = [];
        const notPresent: Array<{ symbol?: string; object_id?: string }> = [];

        if (sel.kind === "symbols") {
          for (const raw of sel.values) {
            const sym = raw.trim().toUpperCase();
            const hit = present.find((p) => (p.symbol ?? "").toUpperCase() === sym);
            if (hit?.object_id) {
              const objectType = (hit.object_type as WatchlistObjectType) ?? "instrument";
              removeRefs.push({ object_type: objectType, object_id: hit.object_id });
              removed.push({ object_type: objectType, object_id: hit.object_id, symbol: sym });
            } else {
              notPresent.push({ symbol: sym });
            }
          }
        } else {
          for (const id of sel.values) {
            const hit = present.find((p) => p.object_id === id);
            if (hit) {
              const objectType = hit.object_type as WatchlistObjectType;
              removeRefs.push({ object_type: objectType, object_id: id });
              removed.push({ object_type: objectType, object_id: id });
            } else {
              notPresent.push({ object_id: id });
            }
          }
        }

        if (removeRefs.length > 0) {
          await rh.updateWatchlistItems(list_id, "delete", removeRefs);
        }
        return text({ list_id, operation: "remove", removed, not_present: notPresent });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_follow_watchlist",
    "Follow a Robinhood-curated list so it appears in your watchlists. Use only for curated lists (from robinhood_get_popular_watchlists) — you already own your custom lists. Following an already-followed list is a no-op. CONFIRM WITH THE USER before calling — this adds the list to the user's account.",
    {
      list_id: z
        .uuid()
        .describe(
          "UUID of the Robinhood-curated list to follow (from robinhood_get_popular_watchlists).",
        ),
    },
    FOLLOW_ANNOTATIONS,
    async ({ list_id }) => {
      try {
        const rh = await getAuthenticatedRh();
        await rh.followWatchlist(list_id);
        return text({
          list_id,
          operation: "follow",
          followed: true,
          note: "Now following this curated list; it will appear in robinhood_get_watchlists. The API echoes the request, not the new state — following an already-followed list is a no-op.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_unfollow_watchlist",
    "Stop following a Robinhood-curated list. The list itself is unchanged — it just no longer appears in your watchlists. Unfollowing a list you don't follow is a no-op. CONFIRM WITH THE USER before calling.",
    {
      list_id: z.uuid().describe("UUID of the Robinhood-curated list to unfollow."),
    },
    FOLLOW_ANNOTATIONS,
    async ({ list_id }) => {
      try {
        const rh = await getAuthenticatedRh();
        await rh.unfollowWatchlist(list_id);
        return text({
          list_id,
          operation: "unfollow",
          followed: false,
          note: "No longer following this curated list; it is removed from robinhood_get_watchlists. The list itself is unchanged.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_add_option_to_watchlist",
    'Add option contracts to your options watchlist. Each option_id becomes a single-leg contract. Source option_ids from robinhood_get_options / robinhood_get_option_instruments. Already-present contracts are reported as already_present (no duplicate is created). Only position_type "long" is supported over this path (short-leg watchlist entries must be added via the Robinhood app). CONFIRM WITH THE USER before calling — this is a real write.',
    {
      option_ids: z
        .array(z.uuid())
        .min(1)
        .max(MAX_OPTION_IDS)
        .describe("Option contract UUIDs to add (each becomes a single-leg contract)."),
      position_type: z
        .enum(["long", "short"])
        .nullish()
        .describe('"long" (default). "short" is not supported over this path — use the app.'),
    },
    ADD_ANNOTATIONS,
    async ({ option_ids, position_type }) => {
      try {
        if ((position_type ?? "long") !== "long") {
          return textError(
            'Only position_type "long" is supported for options-watchlist writes over this API path. Add short-leg entries via the Robinhood app.',
          );
        }
        const rh = await getAuthenticatedRh();
        const ids = option_ids.filter(Boolean);

        // Dedupe against current contents first (quick_add MINTS — a repeat would
        // create a duplicate row, so a pre-read keeps the op honestly idempotent).
        const existing = await rh.getOptionWatchlistContracts();
        const present = new Set(
          existing.map((c) => c.strategy_code).filter((s): s is string => Boolean(s)),
        );
        const toAdd = ids.filter((id) => !present.has(`${id}_L1`));

        // Validate the ids we WILL write BEFORE any write (a bogus id must fail
        // before it can touch the list). All-or-nothing on resolution.
        await Promise.all(toAdd.map((id) => rh.getOptionInstrumentById(id)));

        const results: Array<{ option_id: string; status: string; reason?: string }> = [];
        for (const id of ids) {
          if (!toAdd.includes(id)) {
            results.push({ option_id: id, status: "already_present" });
            continue;
          }
          try {
            await rh.quickAddOption(id, "long");
            results.push({ option_id: id, status: "ensured_present" });
          } catch (e) {
            results.push({ option_id: id, status: "failed", reason: String(e) });
          }
        }
        return text({
          operation: "add_option",
          position_type: "long",
          results,
          summary: {
            ensured_present: results.filter((r) => r.status === "ensured_present").length,
            already_present: results.filter((r) => r.status === "already_present").length,
            failed: results.filter((r) => r.status === "failed").length,
          },
          note: "Each option is added as a single-leg long contract. Already-present contracts are no-ops. Adds apply one at a time (not atomic) — see per-id status. Verify with robinhood_get_option_watchlist.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );

  server.tool(
    "robinhood_remove_option_from_watchlist",
    'Remove option contracts from your options watchlist. Provide the option_ids (from robinhood_get_option_watchlist). Contracts not on the list are reported as not_present, not an error. Only position_type "long" is supported over this path. CONFIRM WITH THE USER before calling.',
    {
      option_ids: z
        .array(z.uuid())
        .min(1)
        .max(MAX_OPTION_IDS)
        .describe("Option contract UUIDs to remove (from robinhood_get_option_watchlist)."),
      position_type: z
        .enum(["long", "short"])
        .nullish()
        .describe('"long" (default). "short" is not supported over this path — use the app.'),
    },
    REMOVE_ANNOTATIONS,
    async ({ option_ids, position_type }) => {
      try {
        if ((position_type ?? "long") !== "long") {
          return textError(
            'Only position_type "long" is supported for options-watchlist writes over this API path. Remove short-leg entries via the Robinhood app.',
          );
        }
        const rh = await getAuthenticatedRh();
        const ids = option_ids.filter(Boolean);
        const list = await rh.getOptionWatchlist();
        if (!list?.id) {
          return text({
            operation: "remove_option",
            removed: [],
            not_present: ids.map((id) => ({ option_id: id })),
            note: "No options watchlist found — nothing to remove.",
          });
        }
        const contracts = await rh.getOptionWatchlistContracts();
        const removeRefs: WatchlistItemRef[] = [];
        const removed: Array<{ option_id: string; object_id: string }> = [];
        const notPresent: Array<{ option_id: string }> = [];
        for (const id of ids) {
          // fable B: exact full-string strategy_code equality — never split-parse.
          const expected = `${id}_L1`;
          const hits = contracts.filter(
            (c) => c.strategy_code === expected && c.object_type === "option_strategy",
          );
          if (hits.length === 0) {
            notPresent.push({ option_id: id });
            continue;
          }
          for (const hit of hits) {
            // Duplicates → remove all (declarative "removed" means ensure-absent).
            removeRefs.push({ object_type: "option_strategy", object_id: hit.object_id });
            removed.push({ option_id: id, object_id: hit.object_id });
          }
        }
        if (removeRefs.length > 0) {
          await rh.updateWatchlistItems(list.id, "delete", removeRefs);
        }
        return text({
          operation: "remove_option",
          position_type: "long",
          removed,
          not_present: notPresent,
          note: "Removed the matching single-leg long contracts (matched by exact strategy_code). Contracts not on the list are reported as not_present, not an error. Verify with robinhood_get_option_watchlist.",
        });
      } catch (e) {
        return textError(String(e));
      }
    },
  );
}
