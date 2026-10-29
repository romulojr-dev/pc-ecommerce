# 022 — Plan: Share a build by link

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #59

## Context

`/builder` keeps the build only in the browser. This story adds the first server-side build data: an immutable `Build` / `BuildItem` snapshot, a **Share build** dialog on `/builder`, a read-only `/builds/<slug>` page, and **Open in builder**. It is also the app's first anonymous write and first server action, and #62 and Sprint 7 reuse the table.

Review added: a production guard on the catalog reset commands, a proof that a normal re-seed keeps builds, an exact canonical hash form, P2002 handling, an "Incomplete" status for builds with retired parts, and skipping the replace prompt when contents are equal.

Checked while planning:

- The non-reset seed ([prisma/seed/write.ts](../../../prisma/seed/write.ts)) upserts categories and brands by slug and products by SKU in place, and never deletes. Builds survive a re-seed, so **no separate Sprint 5 issue is needed**; E70 locks it in.
- The `--reset` guard was `NODE_ENV === "production"` only ([prisma/seed.ts](../../../prisma/seed.ts)). A hand-run against production URLs with `NODE_ENV` unset passed it. The new host check closes that.
- Next 16 docs: a `"use server"` file's exports are public POST endpoints, so the action validates everything and returns only `{ slug }` or a small reason object.

## Reuse

- **Engine** ([lib/builder/index.ts](../../../lib/builder/index.ts)): `parseBuild`, `assembleBuild`, `toBuildItems`, `checkBuild`, `buildStatus`, `estimateWattage`, `SLOTS`, `SLOT_LIMITS`.
- **Build state:**
  - `MAX_BUILD_PRODUCTS`, `capProducts`, `BuilderPartData` ([lib/build-state/parts.ts](../../../lib/build-state/parts.ts)).
  - `buildTotal`, `unavailableParts`, `availabilityMessage`, `buildNotice` ([lib/build-state/summary.ts](../../../lib/build-state/summary.ts)).
  - The store ([lib/build-state/store.ts](../../../lib/build-state/store.ts)) and `SLOT_COPY`.
- **Server:**
  - `getBuilderParts` and `builderPartSelect` ([lib/builder-parts.ts](../../../lib/builder-parts.ts)).
  - `manilaToday`, `isBuyable`, `stockStatusLabel` ([lib/stock.ts](../../../lib/stock.ts)).
  - React `cache`, `notFound()` and `connection()` as in the product page ([app/(store)/[category]/[product]/page.tsx](../../../app/(store)/[category]/[product]/page.tsx)).
- **SEO:** `socialMetadata` ([lib/seo/metadata.ts](../../../lib/seo/metadata.ts)); the `/builder` page's metadata as the template ([app/(store)/builder/page.tsx](../../../app/(store)/builder/page.tsx)). `builds` is already in `RESERVED_SLUGS`.
- **UI:**
  - `Dialog*`, `Button`, `Skeleton` (`components/ui/`) and `ProductImage`.
  - `SeverityMarker` and `PartPrice` in [components/builder/slot-section.tsx](../../../components/builder/slot-section.tsx).
  - `BuildSummary` and `powerText` ([components/builder/build-summary.tsx](../../../components/builder/build-summary.tsx)).
  - The dialog pattern in [components/product/add-to-build.tsx](../../../components/product/add-to-build.tsx).
- **Tests:**
  - `seed`, `buildA`, `buildOf` ([test-support/seed-parts.ts](../../../test-support/seed-parts.ts)).
  - `resetCatalog`, `insertFixtures` ([test-support/db.ts](../../../test-support/db.ts)); host parsing in [test-support/db-guard.ts](../../../test-support/db-guard.ts).
  - Markup tests with `renderToStaticMarkup`, since the repo has no DOM test library. `vitest.db.config.ts` already picks up any `*.db.test.ts`.

## Files

```
prisma/schema.prisma                     + Build, BuildItem (Restrict on productId, unique build+slot+product,
prisma/migrations/…_share_builds/          index on productId); `pnpm db:migrate --name share_builds`
lib/builder/canonical.ts (+test)         canonicalItems(items): [slot, productId, quantity][] sorted by slot
                                         then productId (plain string compare); canonicalText() = JSON.stringify.
                                         Pure, exported from lib/builder/index.ts. E57–E60, E3
lib/build-state/share.ts (+test)         MAX_SHARE_QUANTITY = 99; shareInput(items: unknown) → { ok, items } |
                                         { ok:false, reason, slot?, productId?, max? }: list? → >20 → [] →
                                         parseBuild no changes → quantity ≤ 99 (no DB). E9–E14, E18
lib/build-share.ts (+db.test)            shareBuild(items, { newSlug? }): shareInput → getBuilderParts +
                                         assembleBuild (any change → unavailable) → contentHashOf (node:crypto
                                         sha256 hex of canonicalText) → find by hash → db.build.create with
                                         nested items (one implicit transaction); catch P2002: re-read by hash
                                         → slug, else new slug, 3 tries → error. newSlug injectable (E62)
lib/build-share-slug.ts (+test)          randomSlug(): 10 chars of a-z0-9 from crypto bytes with rejection
                                         sampling; isShareSlug(s) for the page. E1, E35
app/(store)/builder/actions.ts           "use server": shareBuildAction(items) → shareBuild(items); thin
                                         wrapper, returns { ok, slug } | { ok:false, reason, … } only
lib/shared-build.ts (+db.test)           getSharedBuild(slug): React cache; build row + items (slot, quantity,
                                         product id/name/status/brand name); ACTIVE ids → getBuilderParts;
                                         others stay { id, name, brand, slot } (never price/specs). null if no
                                         row or no items. E24–E36
lib/build-state/shared.ts (+test)        sharedBuildView(snapshot): assembleBuild of available parts, issues,
                                         status ("incomplete" replaces only "ok"), total, power, not-buyable
                                         line, retired count + banner text, drives sorted by name, and
                                         openPlan { items, snapshotItems, changes }. E24–E33, E30a/b
lib/build-state/share-copy.ts (+test)    shareErrorText(result, nameOf) for the dialog (generic, part gone, too
                                         many, quantity-too-high naming the part)
lib/build-state/summary.ts               buildNotice gains the "shared build" lines (second argument)
lib/build-state/store.ts (+test)         + load(items, sharedGone): replace the saved build (parseBuild +
                                         capProducts), set sharedGone slots; dismissNotice clears both. Not
                                         persisted. Ignored before the read
components/builder/part-summary.tsx      extracted from slot-section.tsx: image, brand, linked name, price
                                         (PartPrice), stock label, SeverityMarker; PartRow uses it, so /builder
                                         is unchanged
components/builder/share-dialog.tsx      client: states idle/creating/created/error; calls the action with
 (+test)                                 buildStore.getState().items at click; stale response ignored after
                                         close; link from window.location.origin; focus + select field;
                                         Copy link with navigator.clipboard and the fallback text;
                                         role=status / role=alert. Markup test on the presentational body
components/builder/build-summary.tsx     + Share build button (disabled + described note when empty/loading)
components/builder/builder.tsx           owns the dialog; passes canShare/onShare
app/(store)/builds/[slug]/page.tsx       connection(); isShareSlug → notFound; getSharedBuild → notFound;
                                         metadata (noindex, canonical, socialMetadata); no loading.tsx
components/builds/shared-build.tsx       server: banner, eight slot rows (read-only, "No part chosen", retired
 (+test)                                 rows), summary panel (reuses powerText/status pieces), Open button
components/builds/open-in-builder.tsx    client: waits for hydrated; same canonical text → router.push; else
                                         saved items non-empty → Dialog (Replace/Cancel); else load + push
lib/db-url.ts                            parseDatabaseUrl()/describe() extracted from test-support/db-guard.ts
                                         (db-guard.ts imports it; its tests stay green)
lib/reset-guard.ts (+test)               assertResetAllowed(env, { requireProductionHost }): NODE_ENV /
                                         VERCEL_ENV production, host == PRODUCTION_DATABASE_HOST, or unset
                                         host when required. E63–E67
lib/env.ts, .env.example                 + PRODUCTION_DATABASE_HOST (optional)
prisma/seed.ts                           replace the NODE_ENV check with assertResetAllowed(…, require: true)
prisma/seed/write.ts                     TRUNCATE adds "Build"; fix the comment about builds
prisma/seed/reset-cli.test.ts            child-process run of `tsx prisma/seed.ts --reset` with refused envs
                                         (dummy DATABASE_URL; exits 1 before any connection). E68
prisma/seed/write.db.test.ts             E70: share Build A, writeSeed twice (reset:false) → rows unchanged
test-support/db.ts                       resetCatalog: assertResetAllowed(…) first, then TRUNCATE incl. "Build".
                                         E23, E69
e2e/share-build.spec.ts (+ seo.spec.ts)  AC flow, 404, noindex/canonical, sitemap
docs/adr/0007-share-builds-as-content-addressed-snapshots.md, CLAUDE.md
```

## Design

- **Canonical form** is the contract in the spec: sort by slot name then product id, `JSON.stringify` of `[slot, productId, quantity]`, SHA-256 hex. `canonicalItems` lives in `lib/builder` because the browser also compares with it; only hashing is server-side. The unit test pins E57's exact text and hash.
- **Share flow** (`shareBuild`), in the spec's order, with every rejection returning before any write:
  1. shape and size;
  2. empty;
  3. `parseBuild` changes;
  4. quantity above 99 (`quantity-too-high` with slot, product id and max);
  5. the active-product check;
  6. hash, find, create.

  A single nested `create` is atomic, so no `$transaction` is needed. On P2002 it looks up by `contentHash` first: found → that slug (E61); not found → a slug collision, so a new slug, up to 3 tries. **Risk to verify early:** that the pg adapter surfaces unique violations as `P2002`. E61 and E62 in the DB tests prove it.
- **The server action stays thin** (D12): `shareBuildAction` only forwards to `shareBuild`. No rate limiting here (#64).
- **The shared page** reads per request. Available parts come from `getBuilderParts` (so the builder's validity filter applies); everything else is "no longer sold" with name and brand only. The pure `sharedBuildView` also builds `openPlan` on the server (parse, assemble, drives by name, `changes`), so the client button gets plain data and runs no engine code. The store's `load` re-runs `parseBuild` and `capProducts` defensively.
- **Open in builder** uses client navigation (`router.push("/builder")`), so the in-memory shared-build notice survives. The notice lives next to `noticeChanges` in the store and is never persisted.
- **Status "Incomplete"** has its own icon and label and applies only where the engine would say "ok" (D18). The banner sits above the slots as page content.
- **The reset guard** is one pure function used by the script (fails closed on an unset host) and by `resetCatalog()` (a second lock; no host requirement, because `resolveTestDatabase` already keeps tests off the app's host). The two callers read `process.env.VERCEL_ENV`, as `NODE_ENV` is already read.
- **Dev database:** local E2E writes one `Build` to the dev database (idempotent by contents).

## Tasks

See [tasks.md](tasks.md).

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- `pnpm test:db:up`, then `pnpm test:db` with the inline Docker `TEST_DATABASE_URL` (never `.env.local`).
- `pnpm test:e2e` against `pnpm dev` (the key-warning and hydration guards apply), then `pnpm build` and `CI=1 pnpm test:e2e` for the production build.
- Manual check at 1024 and 1280 px, then on the Vercel preview:
  - share Build A, open the link in a private window, Open in builder;
  - Open in builder with a non-empty local build and with an identical one;
  - retire a part in the dev database and reload the shared page (banner, "Incomplete");
  - keyboard only through the dialog; a screen reader announces "Link copied".
- `pnpm db:seed --reset` with `NODE_ENV=production`, with `PRODUCTION_DATABASE_HOST` unset, and with it set to the target host: refused each time, nothing written.
