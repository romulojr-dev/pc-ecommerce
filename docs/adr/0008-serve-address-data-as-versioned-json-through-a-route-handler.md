# ADR 0008 — Serve PH address data as versioned JSON through a route handler

Status: **Accepted** · Date: 2026-10-31 · Story: #76 · Spec: [028-shipping-data-and-fee-rules](../specs/028-shipping-data-and-fee-rules/spec.md)

## Context

The checkout form asks for region → province → city or municipality → barangay (FR-15), and the shipping fee depends on the region's zone (FR-16). Two readers need the same data:

- **The browser**, to fill four dropdowns one step at a time.
- **The server**, to check the chosen codes at checkout and take the names from the data, not from the client.

The source is the PSA's PSGC workbook, published every quarter: 43,769 rows (18 regions, 82 provinces, 1,642 cities and municipalities, 42,010 barangays in `2026Q3`). It has quirks: NCR has no provinces, highly urbanized cities sit outside any province, the City of Manila has districts, two rows are "not a province" parents, and ZIP is not in it.

## Decision

**Convert once, commit the output, and read it through one loader.**

- `pnpm psgc:convert` turns `data/psgc/2026Q3.xlsx` (committed) into compact JSON in `data/psgc/json/2026Q3/` (committed, **outside `public/`**): `manifest.json`, `regions.json`, `provinces/{regionCode}.json` and `cities/{provinceCode}.json` (each city with its barangays). A rerun gives identical bytes. The version is a constant (`PSGC_VERSION`) and the folder name; a new quarter is a new folder.
- **Every region has a province step.** PSGC's gaps become pseudo-provinces: NCR is "Metro Manila", each of the 17 independent cities is its own, and so are the City of Isabela and the Special Geographic Area. The Manila districts are not a level. The address always has four levels, so the form, the stored address and the validation have one shape.
- **Independent cities are also listed in their geographic province** as short entries with no barangays (`independentCityProvinces`, hand-made and tested against the dataset). Their barangays stay in their own file, so nothing is duplicated; the form decides which path to offer.
- **One loader** (`lib/psgc/files.ts`) is the only reader. `parsePsgcPath` accepts four file shapes and the current version and nothing else, so request text never becomes a file path.
- **The browser gets the files from a route handler**, `GET /api/psgc/{version}/…`. A known file answers 200 with `Cache-Control: public, max-age=31536000, immutable` (the version is in the URL, so the content never changes). Every miss is a 404 with `no-store` and an empty body, so a file added by a later version is never hidden by a cached 404. Only `GET` is served.
- **The server reads the same files** through the same loader in `resolveAddress`, which returns names and the zone, or `null`.
- **File tracing is explicit.** `next.config.ts` lists `data/psgc/json/**` in `outputFileTracingIncludes` for the data route, and every route that calls `resolveAddress` must be added there.

**Checked on Vercel before the rest was built** (preview deploy, 2026-10-30): the data route answered 200 with the immutable header, and a temporary route that called `resolveAddress` once returned the right address from the same function runtime. The temporary route was deleted before the merge.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Static files in `public/`, and the server reads them too | On Vercel `public/` is served by the CDN and its files are not guaranteed to be in a function's file system, so the server would depend on something the platform doesn't promise |
| A database table of places | 43,000 rows to seed and keep in step with a quarterly publication, and a query for every dropdown, for data that never changes between versions |
| One JSON file for everything | 1.8 MB for every checkout |
| One barangay file per city | 1,655 files and an extra request for every city choice |
| Skip the province step for NCR and independent cities | Two address shapes, with `provinceCode` sometimes null |
| Copy an independent city's barangays into its geographic province's file | Cebu's file would grow by three cities' barangays and there would be two copies to keep equal |
| A route per level | More handlers for one job |

## Consequences

- **Sizes.** The 102 city files total 1.81 MB; the largest is Metro Manila's, 75,469 bytes (11,507 gzipped), and Iloilo's is the largest gzipped at 14,211. A test fails if a generated file passes 120,000 bytes. The workbook adds 3.2 MB to the repository.
- **Tracing is belt and braces.** Turbopack traced the files even with no `outputFileTracingIncludes` entry, because it follows the plain `path.join(process.cwd(), …)` call. That is an accident of the analysis, not a promise, so the explicit entry stays. The key `/api/psgc/*` was checked to match the catch-all route by tracing a file nothing else traces.
- **A route that forgets its entry may work in a build and fail on Vercel.** #77 and #78 must add the keys for the routes that call `resolveAddress`; their specs say so.
- **A new quarter** is: put the workbook in `data/psgc/`, change `PSGC_VERSION`, run `pnpm psgc:convert`, and fix what the tests name (counts, and the independent-city map if a city became independent). Orders keep the names and codes they were placed with, so old versions are not needed.
- **The names are as the PSA publishes them** ("City of Cebu", not "Cebu City"), cleaned only of spaces, footnote markers and "(Not a Province)". Sorting and labels are the form's job.
- **The data route is an open read.** The data is public and the route accepts no input beyond a whitelisted path. Rate limiting is #64.
- **The loader keeps files in memory** for the life of the process. They never change for a version.
