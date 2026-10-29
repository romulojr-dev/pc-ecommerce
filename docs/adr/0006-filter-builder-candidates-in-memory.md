# ADR 0006 — Filter builder candidates in memory with the shared rules engine

Status: **Accepted** · Date: 2026-10-28 · Story: #54 · Spec: [021-slot-picker](../specs/021-slot-picker/spec.md)

## Context

The builder's slot picker shows, by default, only the parts of a category that fit the shopper's build and can be bought now (PRD › PC Builder › Flow, step 3). "Show all" adds the rest, greyed out, with the reason each one doesn't fit. The answer has to come back within the PRD's 100 ms builder budget, and it has to change as the build changes, with no request.

The compatibility rules already exist once, as pure TypeScript in `lib/builder/` ([spec 018](../specs/018-compatibility-rules/spec.md), [spec 019](../specs/019-count-capacity-power-rules/spec.md)). The browser runs them for instant feedback, and the server will run them again at checkout. The rules read JSONB specs, and some of them combine several parts: PSU wattage sums the CPU and GPU, M.2 slots counts drives.

There are two ways to get "parts that fit":

- Translate each rule into a SQL condition on `Product.specs` and filter in the database.
- Load the category's active parts and run `checkCandidate` on each one in the browser.

## Decision

The picker **loads every active part of the slot's category** from a no-store route (`GET /api/builder/candidates?slot=`, ADR 0003's per-request data). It then **runs `checkCandidate` on each one in the browser**, against the current build. Grouping, hiding, greying and the reasons all come from the engine's output. No compatibility rule is written in SQL.

**Checkout re-checks the build on the server with the same engine.** The browser's answer is never trusted for an order: an edited request or a stale tab can't put an incompatible or unbuyable build through.

## Size assumption

This works because builder categories are small. The largest today is Graphics Cards, with 30 active parts. The seed has 12 to 30 per category, about 150 in all. For one build change, the picker's re-check is 30 `checkCandidate` calls, each running `checkBuild` twice. That measures under 1 ms. A CI test holds it under 50 ms, half the 100 ms budget (spec 021, D9). The payload is about 30 cards with their specs, a few tens of kilobytes.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Rules as SQL conditions on `specs` | A second implementation of every rule that can drift from the engine. Multi-part rules (wattage, slot counts) and spec 019's "new or worse than the baseline" don't map to a `WHERE` clause. "Show all" would still need the engine for the reasons |
| Server-side filtering with the engine (route returns only parts that fit) | Every build change or toggle would need a request, which works against the 100 ms budget and the AC. The server would also need the whole build in the request |
| Precomputed compatibility tables | They'd go stale with every spec edit, and the table grows with the product of the categories |

## Consequences

- **One source of truth for compatibility:** a rule change in `lib/builder/` changes the picker, the summary, the "Fits your build" hints on listings and product pages ([spec 023](../specs/023-fits-your-build-hints/spec.md), which runs `checkCandidate` in the browser too) and (later) checkout together.
- **The picker gets no pagination, search or SQL filtering.** It shows the whole category, sorted cheapest first within each group.
- **Payload and CPU grow linearly with category size.** That's fine at tens of parts. It isn't at thousands.
- **Revisit when** a builder category goes above about **500 active parts**, or when the picker is used for **non-builder categories** (fans, OS, peripherals), which may be much larger. Options then:
  - narrow the candidates in SQL with simple, safe prefilters (socket, memory type), then run the engine on what's left;
  - paginate after the engine runs on the server.

  Either way the engine stays the one place the rules are decided.
