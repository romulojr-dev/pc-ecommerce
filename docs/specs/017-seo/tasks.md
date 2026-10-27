# 017 — Tasks: SEO for catalog pages

Plan: [plan.md](plan.md) · Spec: [spec.md](spec.md)

Work top to bottom, one task at a time, and stop after each. Each task leaves `pnpm lint`, `pnpm typecheck` and `pnpm test` passing. Commit after each task (subject-only Conventional Commit); the PR is squash-merged.

- [x] **T1. Absolute URLs.** `lib/seo/urls.ts` (`absoluteUrl`) with its test; `metadataBase` in the root layout; canonical `/` on the home page. *Verify in `pnpm dev`:* the canonical on `/`, `/cpu?page=2` and a product page is absolute and points at itself.
- [x] **T2. JSON-LD.** `lib/seo/json-ld.ts` with its test; `components/seo/json-ld.tsx`; `sku` in `getProductPage`; Product and BreadcrumbList scripts on the product page, with the visible breadcrumbs built from the same array. *Verify:* `pnpm test`; the page source has two `ld+json` scripts that pass validator.schema.org; a local product renamed to `</script><script>alert(1)</script>` renders as text (then revert).
- [x] **T3. Open Graph and Twitter.** `scripts/generate-og-image.tsx` (`pnpm images:og`) and the committed `public/images/og-default.png`; `lib/seo/metadata.ts` (`socialMetadata`) with its test; layout, home, category and product metadata. *Verify:* open the PNG (1200 × 630, under 300 KB); `og:*` and `twitter:*` tags in the source of home, `/cpu` and a product page.
- [x] **T4. Sitemap and robots.** `lib/sitemap.ts` with `lib/sitemap.db.test.ts`; `app/sitemap.ts`, `app/robots.ts`. *Verify:* `pnpm test:db`; `curl` `/sitemap.xml` and `/robots.txt` in `pnpm dev`; `pnpm build`.
- [x] **T5. E2E.** `e2e/seo.spec.ts`: sitemap, robots, JSON-LD, canonicals, social tags. *Verify:* full `pnpm test:e2e`.
- [x] **T6. Docs and wrap-up.** CLAUDE.md (SEO helpers, `pnpm images:og`), tick the spec's criteria; `pnpm format`, `lint`, `typecheck`, `test`, `test:db`, `build`, `test:e2e`; push, check the preview's `X-Robots-Tag` and the Production `NEXT_PUBLIC_SITE_URL`, open the PR per the repo template. After merge: the Rich Results Test.
