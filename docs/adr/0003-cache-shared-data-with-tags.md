# ADR 0003 — Cache shared, rarely changing data with tags

Status: **Accepted** · Date: 2026-10-26 · Story: #20 · Spec: [007-category-menu](../specs/007-category-menu/spec.md)

## Context

Until now every page that reads the database called `await connection()`, so it renders per request. That suits data that changes at runtime (stock, prices) and avoids baking build-time data into pages, since production is seeded after deploy.

The header's category menu (#20) breaks that pattern. It is on every store page, and categories change rarely: through the seed today, and through the admin panel later. Running its query on every request would make every store page dynamic, including home. Each page would then wait for a database round trip, plus a Neon cold start when the database has scaled to zero. That works against the PRD's LCP target.

Next 16 offers two ways to cache a database query:

- `unstable_cache` with `tags` and `revalidate`, the API for projects without Cache Components. Its docs say it "has been replaced by `use cache`", but it remains the supported API while Cache Components is off.
- Cache Components (`cacheComponents: true`), then `"use cache"` with `cacheTag` and `cacheLife`. This is Next 16's recommended model, but it is a project-wide switch that changes how every route renders.

## Decision

Data is loaded in one of two ways, chosen by how it changes:

| Data | Approach | Examples |
| --- | --- | --- |
| **Per request:** changes at runtime, or depends on the visitor | `await connection()` in the page, then query | Stock, prices, product lists, cart, account |
| **Shared and rarely changing:** the same for every visitor, edited only by the seed or an admin | A function in `lib/` wrapped in `unstable_cache`, with a named tag and a `revalidate` backstop | Category menu (tag `categories`, 1 hour) |
| **Teaser lists:** product data that a few minutes of staleness doesn't hurt, because the pages that sell re-read it per request | As above, with a short `revalidate`, and the page's `export const revalidate` set to match | Home page Featured, Deals and brands (tag `products`, 10 minutes; [spec 016](../specs/016-home-page/spec.md)) |

Rules for cached data:

- **One tag per kind of data**, exported as a constant next to the cached function, so writers can't misspell it.
- **Every write through the app invalidates the tag**: `updateTag(tag)` in a server action when the editor should see the change at once, `revalidateTag(tag, "max")` otherwise.
- **`revalidate` is a backstop, not the refresh mechanism.** It covers changes made outside Next (the seed, the Neon console), which can't invalidate a tag. Pick the longest delay that is acceptable for such a change.
- **Return plain, serializable data** (`{ name, slug }[]`, not Prisma objects with dates).
- **Don't read request data** (`cookies()`, `headers()`) inside a cached function.

We do **not** enable Cache Components now.

## Consequences

- Store pages that read no per-request data stay static, so they are served from the CDN.
- **`pnpm build` needs a reachable database**, because static pages run cached queries at build time. Vercel and CI already provide one, since both run `db:deploy` before the build.
- **Out-of-band changes are delayed.** After `pnpm db:seed` or a manual edit, cached data is stale for up to the `revalidate` time (see the README).
- Each new cached function adds an invalidation duty to the code that writes the same data, and the Admin epic must honor it.
- **Moving to Cache Components** means replacing `unstable_cache` with `"use cache"` + `cacheTag(tag)` + `cacheLife(...)`. The tags stay the same, so the writers don't change. Reconsider when one of these happens:
  - a page needs to mix static and per-request parts (partial prerendering), for example the product page with live stock;
  - `unstable_cache` is deprecated with a removal date, or misbehaves in a Next upgrade;
  - more than a few cached functions exist, so a migration is getting expensive.
  The evaluation is its own story, and its outcome supersedes this ADR.
