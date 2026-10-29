# ADR 0007 — Share builds as content-addressed snapshots, and guard the catalog reset

Status: **Accepted** · Date: 2026-10-29 · Story: #59 · Spec: [022-share-build](../specs/022-share-build/spec.md)

## Context

A shopper can share a build by link, with no account. The link has to show what the sharer chose, even after the sharer edits their build, and the same table will hold cart snapshots (#62) and saved builds (Sprint 7, `SavedBuild` points at a snapshot). Three things follow:

- **Identity.** Sharing the same contents twice, or from two browsers at once, should give one row and one link, not a new row per click. The browser must not be able to choose the identity.
- **Lifetime.** A snapshot holds only product ids, slots and quantities. Products are retired by setting their status, never deleted ([PRD data model](../prd.md)), so a snapshot's parts must stay present.
- **User data now exists.** Until this story every table was rebuildable from the seed. `Build` rows are the first data that isn't, and `pnpm db:seed --reset` truncates the catalog.

## Decision

**A snapshot is a content-addressed row.**

- `Build(id, shareSlug unique, contentHash unique, createdAt)` and `BuildItem(buildId, slot, productId, quantity)`, unique per build + slot + product. No user, no name.
- **Identity is a hash the server computes.** The canonical form is exact, because the hash is stored: take the validated items as `[slot, productId, quantity]`, sort by slot name and then product id as plain strings (not by the builder's slot order, which may change), `JSON.stringify` the list with no whitespace, and take the SHA-256 of the UTF-8 bytes as 64 lowercase hex characters. The same set of items in any order has the same hash. The client never sends a hash.
- **The slug is random**, 10 characters of `a-z0-9`, never derived from the hash. A slug made from the contents could be computed by anyone who knows a build's parts.
- **One writer path.** The server action is a thin wrapper around `shareBuild`, which validates (`parseBuild` must report no changes; at most 20 items; quantity at most 99; every product active and in its own slot), then inserts the `Build` with its items in one nested create. On a unique-constraint error (Prisma `P2002`) it looks the row up by `contentHash` and returns its slug. If there is none, the conflict was a random slug collision, and it retries with a new slug, three times at most.
- **`BuildItem.productId` is `onDelete: Restrict`.** Deleting a product that a snapshot uses fails in the database.
- **Snapshots are immutable.** The app has no update or delete for them. Changed contents get a new row and a new link; old links keep showing the old contents, with current prices and stock.

**The catalog reset refuses production.** One pure function, `assertResetAllowed`, throws when `NODE_ENV` or `VERCEL_ENV` is `production`, or when the host of `DATABASE_URL` is the one in `PRODUCTION_DATABASE_HOST`. `pnpm db:seed --reset` also refuses when that variable isn't set (it fails closed). `resetCatalog()` in the test helpers calls the same function as a second lock. `--reset` and `resetCatalog()` also truncate `Build` explicitly, because `TRUNCATE … CASCADE` from `Product` empties `BuildItem` but not `Build`.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A new row per share click | Duplicates for the same build, and #62 would need its own dedupe |
| A slug cut from the hash | Anyone who knows the contents can compute it and test whether it was shared |
| Sort by the builder's slot order | Adding or reordering a category would change every stored hash |
| Repair malformed input (`parseBuild`'s usual behavior) and hash the result | The link would show a different build from the one the shopper sees |
| `onDelete: Cascade` or `SetNull` on `BuildItem.productId` | Deleting a product would silently change shared builds |
| Guard the reset with `NODE_ENV` and `VERCEL_ENV` only | The production seed is run by hand, where `VERCEL_ENV` is never set and `NODE_ENV=production` is only a habit ([spec 004](../specs/004-product-list/spec.md)). A hand-run `--reset` with production URLs in the shell would pass. The host check closes that |

## Consequences

- **The canonical form is a contract.** Changing it makes the same contents hash differently, so a later share creates a second row (old links keep working). A change needs a new ADR.
- **A re-seed keeps builds.** The seed upserts categories and brands by slug and products by SKU in place, and never deletes, so ids stay and `BuildItem` rows still point at them. An integration test keeps that true ([spec 022](../specs/022-share-build/spec.md), E70).
- **Retiring a product is the only way to remove it** from the catalog. The Admin epic must use `status`, never a delete.
- **The share action is an open write.** Anyone can create rows with real product ids. Validation bounds each request, and rate limiting is #64.
- **`--reset` needs `PRODUCTION_DATABASE_HOST` in `.env.local`.** One line, once. It isn't needed for plain `pnpm db:seed`, for the app, or in CI.
- **Not covered:** `prisma migrate reset`, the Neon console and hand-written migrations can still empty a database. `Restrict` stops a delete of a used product, not a `TRUNCATE`.
