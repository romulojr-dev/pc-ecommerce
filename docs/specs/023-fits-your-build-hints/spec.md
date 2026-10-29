# 023 — "Fits your build" hints on product pages and listing cards

Status: **Approved** (review changes applied) · Issue: #61 (epic #3, depends on nothing; builds on #51, #52, #53 and #54, all merged) · PRD refs: FR-10 (Product page); PC Builder › Compatibility rules (MVP); Milestones (Sprint 5)

## 1. Summary

This story tells a shopper who has a build in progress whether each part fits it, without opening the builder. A small badge on category listing cards, search result cards and the product page reads **Fits your build**, **Fits, with warnings**, **Doesn't fit your build**, or **In your build**. The browser computes it with `checkCandidate`, the same call the slot picker makes (ADR 0006), against the saved build (spec 020). The pages stay server-rendered per request (ADR 0003): the server sends only each product's id, slot, name and the spec fields the rules read, and the badge appears after the saved build and its parts have loaded. The badge shows only when the build has parts a rule can compare the product against; a CPU is not "checked" against a build that holds only storage.

## 2. Behavior

### Where it shows

1. The badge shows in three places: **category listings** (`/cpu`, `/motherboard`, …), **search results** (`/search?q=`, `/search?brand=`) and the **product page** of a builder-category product. It does not show on "Similar products", home page cards, the slot picker or `/builder` rows (the picker and the builder have their own markers, specs 020 and 021).
2. A product outside the builder categories gets no badge and no reserved space. The MVP catalog has none yet.
3. "The build" is the saved build in this browser (spec 020: `localStorage`, read after mounting). There is no new URL state and no cookie. The server never knows the build, so the HTML of these pages is the same for everyone.

### The four states

4. For one product, in this order (the first that applies):

   | State | When | Label | Icon |
   | --- | --- | --- | --- |
   | In your build | The product is already in the loaded build (for storage: any drive entry with that product), even when nothing else is there to compare it with | **In your build** | check in a circle |
   | None | Behavior 6 | Nothing visible | — |
   | Doesn't fit | `checkCandidate` returns one or more errors | **Doesn't fit your build** | circle with an X |
   | Fits, with warnings | No errors, one or more warnings | **Fits, with warnings** | warning triangle |
   | Fits | No issues | **Fits your build** | check |

   The state is shown as text plus an icon, never color alone. Errors decide before warnings, as in the picker (spec 021).
5. Stock does not change the state. An out-of-stock or pre-order part still reads "Fits your build" when it fits: the card and the product page already show its stock label, and "Add to build" is already disabled for it (spec 020 Behavior 18).

### When there is no badge

6. Nothing is shown (and only the reserved space remains, Behavior 9) when the product is not already in the build (Behavior 4: "In your build" comes first) and:
   - the saved build has not been read yet (first render, and the server render);
   - the saved build is empty;
   - the build's parts are still loading, or their request failed (no error text: this is an extra, and `/builder` already reports load errors);
   - the build has **no parts a rule can compare this product against** (Rules › Comparable parts). Example: a CPU, when the build holds only storage.

   Nothing here is announced and nothing moves.

### On a listing or search card

7. The badge is a single line under the card's row, in the card's extra slot (`ProductCard` `children`), with the label and its icon. The card stays one link: the name link still covers the card, except on the badge line itself, which isn't a link.
8. **Reasons for screen readers.** For "Doesn't fit" and "Fits, with warnings", the card carries the issue messages as visually hidden text after the label, errors first (the engine's order), each prefixed "Error:" or "Warning:". Sighted users see the label only (the AC). The hidden text is part of the card's reading order, not a tooltip, so keyboard and screen reader users get it without hovering.
8a. **Announced with its card.** The badge sits inside the card's `<article>` but outside the name link, so a screen reader reads the product (name, price, stock) and then its fit state as one item, and the link's accessible name stays the product name. The state is always conveyed by its text, never by color or the icon alone (the icon is hidden from assistive technology).
9. **Reserved space.** Every card of a builder category reserves the badge line's height from the server render on, whether or not a badge ever shows, so the badge appearing after the build loads moves nothing. A card's size is the same before and after.

### On the product page

10. The product page shows the label with its icon, and under it the issue messages as a list (errors first, then warnings), each marked **Error** or **Warning** with an icon, like the picker's greyed cards. "Fits your build" and "In your build" show the label only. The block sits **after the warranty line**, at the end of the buy column, so a long list never pushes the price, stock line, quantity or buttons (D8). Its label line is reserved from the server render on (Behavior 9).
11. The block is named "Fit with your build" for assistive technology. It is not a live region: it appears once the build has loaded, as part of the page.
12. After **Add to build** on the product page, the saved build changes, and the badge follows: the part is now "In your build" (the add itself is announced by spec 020's "Added to your build."). If the part's data has to be fetched first, the badge is blank until it arrives and the reserved space holds the layout.

### Loading and freshness

13. **One request per page view.** All badges on a page share one load of the build's parts through the existing `GET /api/builder/parts?ids=` (spec 020 Behavior 5, `no-store`), made through `useBuildParts`. A listing of 24 cards makes one request, not 24; an empty build makes none. A parts request already made for this page is not repeated (spec 020 Behavior 8).
14. The products' own spec data comes from the server render, which is per request, so it is as fresh as the card's price and stock.
15. A change to the build, in this tab or another, recomputes the badges in the browser. Another tab's change reaches the page through `useBuild`'s `storage` listener (spec 020 Behavior 4), which reads the saved build again; no reload and no new listener. A request is made only for an id not yet loaded.
16. **Badges never change the saved build.** A saved part the server says is gone (deleted or draft) is ignored by the badges and stays in the saved build. Only `/builder` removes it, with its notice (D13). A gone part counts as resolved, so it doesn't keep the badges in "loading".
17. **Errors:** a failed parts request shows no badge, no error text and no retry button on these pages. The saved build is untouched. Opening `/builder` shows its own error with "Try again" (spec 020 Behavior 16).

## 3. Examples

Prices and stock are not involved. **Build A** is spec 001's compatible build (`buildA` in `test-support/seed-parts.ts`): AMD Ryzen 5 7600, ASUS ROG Strix B650-A Gaming WiFi, Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30, Samsung 990 PRO 1TB NVMe SSD, ASUS Dual GeForce RTX 4060 OC Edition 8GB, Lian Li LANCOOL 216 Black, Cooler Master MWE 550 Bronze V2, Thermalright Peerless Assassin 120 SE. E1–E12 and E18 were run through `checkCandidate` on the current seed while writing this spec.

### The state of a part (`fitOf`, against Build A)

| # | Candidate | Expected |
| --- | --- | --- |
| E1 | ASRock B650M-HDV/M.2 (AM5). Also ASRock B650I Lightning WiFi, Gigabyte X870E AORUS ELITE WiFi7, ASRock A620M-HDV/M.2, Gigabyte B650 AORUS ELITE AX, ASUS TUF Gaming B850-PLUS WiFi | **Fits your build** (6 AM5 boards) |
| E2 | MSI PRO B760M-A WiFi DDR4 (LGA1700, DDR4) | **Doesn't fit your build**, two errors, in this order: "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4." then "The Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 is DDR5 memory, but the MSI PRO B760M-A WiFi DDR4 takes DDR4." |
| E3 | Every board that isn't AM5: 5 LGA1700 (E2's board, ASUS PRIME B760M-A WiFi, ASRock H610M-HDV/M.2 R2.0, MSI MAG B760 Tomahawk WiFi, Gigabyte Z790 AORUS ELITE AX), 3 LGA1851, 3 AM4 | **Doesn't fit your build** (11 boards). ASUS PRIME B760M-A WiFi has one error (socket) |
| E4 | ASUS ROG Strix B650-A Gaming WiFi (in Build A) | **In your build** |
| E5 | AMD Ryzen 7 9800X3D | **Fits, with warnings**: one warning, the BIOS update ("…may need a BIOS update to run the AMD Ryzen 7 9800X3D…"). AMD Ryzen 5 7600X, 7700 and 7800X3D: **Fits your build** |
| E6 | ASUS Prime GeForce RTX 5070 Ti OC Edition 16GB (300 W) | **Fits, with warnings**: PSU wattage, close to the Cooler Master MWE 550's limit. ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB (575 W) and ASUS TUF Gaming GeForce RTX 5080: **Doesn't fit your build** (PSU wattage error) |
| E7 | Intel Core Ultra 7 265K (LGA1851) | **Doesn't fit your build**: the socket error first, then the PSU wattage warning (475 W, 87%). Errors decide, and the warning is still listed |
| E8 | Memory: Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16; Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36; Corsair Vengeance DDR5-6000 32 GB (in Build A) | **Doesn't fit** (memory type); **Fits** (the board has 4 slots); **In your build** |
| E9 | Storage: Crucial MX500 1TB 2.5" SATA SSD; Samsung 990 PRO 1TB (in Build A) | **Fits your build** (it would be a second drive); **In your build** |
| E10 | Case: Fractal Design Ridge Black. PSU: Corsair SF750 750W SFX | **Doesn't fit your build** (3 errors: form factor, cooler height, PSU form factor); **Doesn't fit your build** (PSU form factor) |
| E11 | Build A with the RTX 4060 swapped for the ASUS ROG Astral RTX 5090 (the build itself has a PSU wattage error). Candidate: Gigabyte X870E AORUS ELITE WiFi7 | **Fits your build**: the error was there without the board, so it isn't blamed on it (spec 019, `checkCandidate`) |
| E12 | Build A, candidate: the Ryzen 7 9800X3D. Open the slot picker for the CPU | The picker puts it in "Fits with warnings" and the badge says **Fits, with warnings**: same call, same result |

### Whether there is anything to compare (`hasComparableParts(build, slot)`)

| # | Build | Candidate's slot | Expected |
| --- | --- | --- | --- |
| E13 | Crucial MX500 only (storage) | cpu | **No badge** (the AC's example) |
| E14 | Crucial MX500 only | motherboard | Badge (M.2 slots rule reads storage and motherboard). Also: gpu, case, psu, memory, cpu-cooler: no badge |
| E15 | Empty | any of the eight slots | No badge |
| E16 | Ryzen 5 7600 only | motherboard, cpu-cooler, psu | Badge (socket, cooler socket, PSU wattage with a CPU). Memory, gpu, case, storage: no badge |
| E17 | RTX 4060 only | psu, case | Badge (PSU wattage with a GPU, GPU length). Cpu, memory, motherboard, cpu-cooler, storage: no badge |
| E18 | Case only | motherboard, gpu, cpu-cooler, psu | Badge. Cpu, memory, storage: no badge |
| E19 | Intel Core i5-14400F (no integrated graphics), build: Samsung 990 PRO only | cpu | **No badge**, though `checkCandidate` alone would return the "no integrated graphics" warning: that rule reads the CPU and not another part |
| E20 | The same CPU, build: MSI PRO B760M-A WiFi DDR4 only | cpu | **Fits, with warnings**: "no integrated graphics" and the BIOS-update warning (the board's launch BIOS predates 14th gen) |
| E21 | Build A, candidate Ryzen 7 9800X3D (CPU slot is filled) | cpu | Badge: the existing CPU is replaced, and the board, cooler and PSU are what it is compared with |

### On the pages (component and E2E)

| # | Scenario | Expected |
| --- | --- | --- |
| E22 | Build A saved; open `/motherboard` | The ASRock B650M-HDV/M.2 (AM5) reads **Fits your build**; the MSI PRO B760M-A WiFi DDR4 and the ASUS PRIME B760M-A WiFi (LGA1700) read **Doesn't fit your build**; the Strix reads **In your build** (the AC's E2E). The E2E asserts these named cards only, never how many boards fit (the counts belong to E1 and E3) |
| E23 | E22, an LGA1700 card | Visible text is the label only. Its accessible text includes "Error:" and the socket message of E2 or E3 |
| E23a | E22, any card | The label is in the card's `<article>`, so the article's accessible text holds the product name, price, stock and the label together; the name link's accessible name is still the product name; the label is text, not an image or color; the badge isn't inside the link (Behavior 8a) |
| E24 | E22, card heights | Each card's box is the same height before the saved build is read and after the badges appear |
| E25 | E22, network | Exactly one `GET /api/builder/parts` request, with the 8 ids. Empty saved build: none |
| E26 | E22 with JavaScript running but `localStorage` empty | No badge on any card; no request; the reserved line is empty |
| E27 | Build A saved; product page of MSI PRO B760M-A WiFi DDR4 | **Doesn't fit your build** and a list of the two E2 messages, each marked "Error". The price, stock line and buttons don't move when it appears |
| E28 | Build A saved; product page of the Ryzen 7 9800X3D | **Fits, with warnings** and the BIOS message marked "Warning" |
| E29 | Build A saved; product page of ASRock B650M-HDV/M.2; of the Strix | **Fits your build** (label only); **In your build** (label only) |
| E30 | Empty saved build, then "Add to build" on the Ryzen 5 7600's page | After the add, the page shows **In your build**; no other state flashes |
| E31 | Build A saved; `/search?q=ryzen` | Ryzen 5 7600 reads **In your build**; Ryzen 5 7600X reads **Fits your build**; Ryzen 5 5600 reads **Doesn't fit your build** (mixed categories each use their own slot) |
| E32 | Build A saved; a product page's "Similar products", the home page's cards, the picker | No badge in "Similar products" or on the home page. The picker's cards are unchanged |
| E33 | Parts request answers 500 | No badge, no error text, cards unchanged; the saved build is unchanged |
| E34 | A part in the saved build was set to draft | The badges ignore it and stay out of "loading"; the saved build still holds it, with no notice created, until `/builder` loads and removes it (Behavior 16, D13) |
| E35 | Two tabs in one browser. Tab 1 has `/motherboard` open with the saved build empty. Tab 2 adds the Ryzen 5 7600 to the build | Tab 1, with no reload: the `storage` event makes `useBuild` read the saved build again; the CPU's data is requested (one request); the motherboard cards then show badges (AM5 boards **Fits your build**, LGA1700 boards **Doesn't fit your build**). Tab 2 then clears the build: Tab 1's badges disappear and the reserved lines stay |
| E36 | Server render of `/motherboard` | The HTML has no badge text, only the reserved lines; the data sent per board holds `id`, `slot`, `name` and `ruleSpecs` with `socket`, `nativeCpuGenerations`, `memoryType`, `memorySlots`, `maxMemoryGb`, `formFactor` and `m2Slots` only (not `chipset` or `hasWifi`) |

## 4. Rules and edge cases

### Comparable parts

A badge shows only when some rule can compare the product with a part already in the build. The table lists the rules by the slots each one needs to run, from the PRD rules table (spec 018). The `integrated-graphics` rule reads the CPU alone, so it never counts.

| Rule | Needs these slots filled |
| --- | --- |
| `socket-match`, `bios-update` | cpu, motherboard |
| `memory-type`, `memory-slots`, `memory-capacity` | memory, motherboard |
| `form-factor` | motherboard, case |
| `gpu-length` | gpu, case |
| `cooler-height`, `radiator-fit` | cpu-cooler, case |
| `cooler-socket` | cpu-cooler, cpu |
| `psu-wattage` | psu, and a cpu or a gpu |
| `psu-form-factor` | psu, case |
| `m2-slots` | storage, motherboard |
| `integrated-graphics` | (cpu alone: never counts) |

The candidate's slot counts as filled. The part it would replace, in its own slot, does not count as something to compare with. So the badge shows when a counted rule needs the candidate's slot and every other slot it needs is filled in the build. For `psu-wattage`: a cpu or gpu candidate needs a PSU in the build; a PSU candidate needs a cpu or a gpu.

- The table is derived from the rules, not kept as a second list that can drift: a new rule must declare its slots, and a test fails if a rule has none (see Test plan).
- The helper looks at the loaded build, so a saved item whose part isn't loaded yet doesn't count.

### The verdict

- `fitOf` is `checkCandidate(build, slot, part)`: the same call, and so the same issues and order, as the slot picker (ADR 0006). The badge is never a second implementation of a rule.
- Memory: the candidate kit replaces the build's kit and keeps its quantity, so a 4-stick kit can read "Doesn't fit" in a build that holds two kits (the picker does the same, spec 021). Storage: the candidate is judged as one more drive. A drive already in the build reads "In your build", whatever its quantity.
- An issue the build already has is not blamed on the candidate (E11).
- A part that is in the build and also causes an issue reads "In your build". The issue shows on `/builder` (D4).
- Verdicts are computed once per build or part-list change and kept, not per render. A listing is at most 24 cards (`PAGE_SIZE`); computing all of them against a full build stays under 50 ms in CI (the picker's budget, spec 021 D9).

### What the server sends

- Per builder-category product on the page: `{ id, slot, name, ruleSpecs }`. `ruleSpecs` holds only the spec fields whose `FieldMeta.rules` is set, taken from the specs the page already loaded (a listing's cards already select `specs`). Specs that fail `validateSpecs` leave the product without a badge, and are logged the way the parts route does (spec 020).
- The rules must give the same issues with `ruleSpecs` as with the full specs. A rule that reads an untagged field would break that, so a test runs every seed part against Build A, B and C both ways and fails on any difference. A field a rule reads must be tagged (spec 018 already requires it to be required).
- `name` is sent because rule messages quote full product names (spec 018) and the engine's part needs it (D1).
- No ruleSpecs, prices or build data go into URLs, cookies or `localStorage`.

### Rendering, hydration and layout

- The server render and the first client render match: both contain only the reserved line. The badge is set after the saved build has been read and its parts have loaded (`useBuild` / `useBuildParts`, spec 020).
- The reserved line is the height of one line of the badge's text and icon, for every builder-category card and the product page's label, from the server render on. Nothing is hidden with `display: none`, which would collapse it.
- The fit data passed to a listing is plain objects, not server-rendered elements, so it can't bring back the missing-key warning of issue #44. The E2E fixture still fails a test on a missing key or a hydration error (`e2e/test.ts`).
- Desktop first (1024 px and up). Below that the card line and the product block stack as they are, unpolished (Phase 2).

### Caching and SEO

- Pages stay per request (`await connection()`, ADR 0003). Nothing about the build is cached, and the product page's JSON-LD, metadata and canonical are unchanged. Crawlers see no badge, only the reserved line.
- No sitemap or robots change.

### Accessibility

- State is conveyed by text, never by color alone: the label plus an icon, and the icon is `aria-hidden`. Contrast meets the app's text tokens in light and dark.
- On a card, the badge is inside the `<article>` and outside the name link, so a screen reader announces it together with its product, and the link's name stays the product name (Behavior 8a, E23a).
- Reasons are text (hidden visually on cards, shown on the product page), never a tooltip or a title attribute.
- The badge is not focusable and not a live region, so 24 badges appearing at once make no noise. The "Added to your build." line stays the only announcement after Add to build.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Fits | Fits your build |
| Fits, warnings | Fits, with warnings |
| Doesn't fit | Doesn't fit your build |
| Already in the build | In your build |
| Card, hidden reasons | Error: {message} · Warning: {message} (each issue, errors first) |
| Product page, issue markers | Error · Warning (the picker's markers) |
| Product page, block name | Fit with your build |

The issue messages are the engine's own (spec 018 and 019), unchanged. No other string is added: no loading text, no error text, no retry (Behavior 6, 17).

## 6. Data and interfaces

No schema change, migration, new route, environment variable or dependency. The parts route and the engine are reused as they are.

- **`ruleSpecsOf(slot, specs)`** (pure, `lib/specs`): the fields of `specs` whose `FieldMeta` has `rules`. Safe for the browser (no server imports).
- **`FitPart`** (type, shared): `{ id, slot, name, ruleSpecs }`. Built on the server from a row by one mapper next to `toBuilderPartData`'s style, returning `null` for non-builder products and bad specs.
- **`hasComparableParts(build, slot)`** (pure, `lib/builder`, exported from `lib/builder/index.ts`): Rules › Comparable parts. Unit-tested.
- **`fitOf(build, part)`** (pure, `lib/build-state`): returns one of `in-build`, `fits`, `warnings` or `errors` (with the issues), or `none` when `hasComparableParts` is false. It is the only place that combines the checks.
- **Product ids for cards.** Listing cards need the product id. `ProductCardData` has none today, so the page passes the fit data alongside the products, matched by slug, and `productCardSelect` gains `id` (the plan chooses).
- **`useBuildParts` option.** A read-only mode for pages that can't show a notice (D13). In it, the hook never calls the store's `drop`, and an id the server doesn't return counts as resolved (not "still loading") and is left out of the loaded build. `/builder` keeps today's behavior (the default), so spec 020 Behavior 6–7 are unchanged there. The existing hook tests gain read-only cases.
- **UI.** One client component renders the badge in the card slot and the product block; a shared client boundary for the page calls `useBuildParts` (read-only) once and hands each badge its verdict (Behavior 13). `ProductCard` gets no new props: it already has `children`.
- **Pages touched:** `app/(store)/[category]/page.tsx`, `app/(store)/search/page.tsx`, `app/(store)/[category]/[product]/page.tsx` (server pages that load `FitPart`s), `components/catalog/listing-results.tsx` (passes the badge in `children`).
- **Docs:** CLAUDE.md gets a short paragraph (the badge, `fitOf`, `hasComparableParts`, `ruleSpecsOf`, the one-request rule). ADR 0006's Consequences gets one line: the listing and product pages reuse the engine in the browser too. No new ADR: this follows ADR 0006 and ADR 0003. README only if it lists features.

## 7. Test plan

| Level | File (indicative) | Covers |
| --- | --- | --- |
| Unit | `lib/builder/comparable.test.ts` | E13–E21: the table's rows for the eight slots across subsets of filled slots; a rule with no declared slots fails; **drift test:** for every slot and every subset of the other slots (Build A's parts), if the helper says "nothing to compare", `checkCandidate` for every seed candidate returns no issue except `integrated-graphics` |
| Unit | `lib/specs/rule-specs.test.ts` | `ruleSpecsOf` keeps exactly the tagged fields in all eight categories; **equivalence test:** every seed part against Build A, B and C gives the same `checkCandidate` issues with `ruleSpecs` as with full specs (E36's contract) |
| Unit | `lib/build-state/fit.test.ts` | E1–E12: states, messages and order against Build A; in-build for storage; memory and storage semantics; E11 (an existing error isn't blamed); precedence In build → None → Errors → Warnings → Fits (review fix: E30's only-part build reads "In your build" though nothing is comparable) |
| Unit | `lib/build-state/fit.perf.test.ts` | 24 verdicts against a full build under 50 ms (median of 20 runs, as `picker.perf.test.ts`) |
| Unit (component) | badge | Each state's label, icon and hidden reasons (E23); nothing before the saved build is read, while parts load, on error (E26, E33); reserved line present in every case (E24 at the unit level: same class and height); the card still renders one link |
| Unit (component) | product block | E27–E29: label, list with Error / Warning markers, errors first; "Fit with your build" name; no live region |
| Unit | `lib/build-state/loader.test.ts` | Read-only mode's pure logic (the repo's unit tests run in Node with no DOM, so hooks aren't unit-tested): ids a successful response didn't return count as resolved and are left out of the next request; the default mode's `goneChanges` is unchanged (E34, D13, spec 020) |
| E2E | `e2e/fits-build.spec.ts` | The hook's behavior: many badges, one request (E25); an empty build makes none; a gone part is never dropped by these pages (covered at the unit level, E34) |
| Unit (component) | accessibility | E23a: the label is inside the article and outside the link; the link's accessible name is the product name; the state is text with an `aria-hidden` icon |
| Integration (Postgres) | none | No query or schema change. The mapper from a row to `FitPart` is pure and covered by unit tests |
| E2E | `e2e/fits-build.spec.ts` | **AC:** Build A saved (ids read from the candidates route and put in `localStorage`, or added through the product pages) → `/motherboard` shows "Fits your build" on the ASRock B650M-HDV/M.2, "Doesn't fit your build" on the MSI PRO B760M-A WiFi DDR4 (LGA1700) and "In your build" on the Strix, by locating those named cards, with **no assertion on how many boards fit** (E22); **accessibility:** each of those cards' article holds its label as text next to the product name, the name link's accessible name is unchanged, and the LGA1700 card's accessible text includes its "Error:" reason (E23, E23a); card height before and after (E24); one parts request (E25); empty storage, no badges (E26); product pages E27–E30; search E31; no badge in related or home (E32); the parts request answered 500 (E33); **cross-tab:** two pages in one browser context, the second adds the Ryzen 5 7600 and the first updates with no reload, then the second clears the build (E35). E34 needs a product status change, which E2E can't make, so the unit rows cover it |
| Existing | `e2e/test.ts` fixture, `rules-coverage.test.ts` | The hydration and missing-key guards run on every test; the rules-coverage test keeps tagged fields required |

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Badges on "Similar products" and home cards | Out of scope by the AC; not planned |
| Products outside the builder categories (fans, OS, peripherals) | When such a category exists, it has no rules and so no badge; a later story if it should |
| Filtering or sorting a listing by fit ("Show only parts that fit") | Not planned; the picker does that (spec 021) |
| Add to build on a "Doesn't fit" product page asking first, like the picker's "Add anyway" | [#68](https://github.com/romulojr-dev/pc-ecommerce/issues/68) (Backlog) |
| Hints from an account's saved builds instead of the browser's saved build | Accounts epic (FR-19) |
| Re-checking a build at checkout | Checkout epic (#62 and later) |
| Cart hints and stock flags in the cart | #60, #63 |
| "Frequently bought together" (FR-11) | Not planned |
| Caching a build's parts across page views | Not planned (D6) |
| Mobile layout below 1024 px | Phase 2 |

## 9. Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | The per-product data is `{ id, slot, name, ruleSpecs }`: the AC's `{ id, slot, ruleSpecs }` plus `name` (**differs from the AC**) | Rule messages quote full product names and the engine's part carries the name (spec 018), so a verdict without it can't build its messages | Sending only the AC's three fields and looking the name up elsewhere (the listing's card data has it, but the product page and engine need it in one place) |
| D2 | Rules that read the candidate alone (`integrated-graphics`) don't count as "something to compare" | The AC says a badge shows only with comparable parts, and a CPU with no iGPU shouldn't get a warning badge against an empty build or a storage-only one (E19). Rules that need another part do count | Showing whenever `checkCandidate` returns anything (a CPU would get a badge against a storage-only build); never showing the iGPU warning (it is real once a board is picked, E20) |
| D3 | The badge uses `checkCandidate`, the picker's call, so the two always agree | ADR 0006: one source of truth for compatibility | A lighter "quick check" for cards |
| D4 | "In your build" replaces the other states for a part in the build | The AC; and the build's own issues already show in `/builder`'s summary | Showing "In your build" plus its issues on the product page |
| D5 | Stock isn't part of the state | Fit is a different question from "can I buy it", and both are already on the card and the page. The picker's four groups mix them because it is a list to add from | A fifth state "Fits, out of stock" |
| D6 | One shared parts load per page; no cache across pages | 24 cards must not mean 24 requests (Behavior 13). The route is small (at most 20 ids) and `no-store` keeps specs and availability fresh | A module-level cache of parts shared between pages (stale after an admin edit, and a new invalidation to get right) |
| D7 | Cards show the label only; the reasons are visually hidden text | The AC. Text in the reading order works for keyboard and screen reader users, unlike a tooltip | A tooltip or title with the reasons |
| D8 | On the product page the block goes after the warranty line | A list of messages arrives after load and must not move the price, stock or buttons | Directly under the stock line (the buttons would jump when a list arrives) |
| D9 | A reserved one-line space in every builder-category card, even for shoppers with no build | The server can't know the build, and a space added after load would shift the cards, which the AC forbids (D14) | Adding the line only when a badge shows; overlaying the badge on the image |
| D10 | No live region for the badges | 24 of them arriving would be noise, and the add action is already announced | `role="status"` on each |
| D11 | No retry or error text on these pages | The badge is an extra and `/builder` reports load problems (spec 020 Behavior 16) | A "Couldn't check your build. Try again" line on every listing |
| D12 | No new ADR | It reuses ADR 0006's decision (rules in the browser) and ADR 0003's (per-request pages) | An ADR for "hints" |
| D13 | **Only a page that can show a notice may change the saved build.** `/builder` removes gone parts (with its notice); the listing, search and product pages only read the build, through `useBuildParts` in read-only mode (review decision, was Q1) | A removal with no notice in sight loses the explanation, and a reload before `/builder` would lose it for good. The rule also covers future pages that read the build | Using the hook unchanged (simpler, but the build is quietly edited from anywhere on the site) |
| D14 | The reserved badge line stays on every builder card (review decision, was Q2) | See D9 | Overlaying the badge on the image |
| D15 | The product page's confirmation for a part that doesn't fit is a separate story, #68 (review decision, was Q3) | It changes spec 020 Behavior 19 and wasn't asked for here | Adding "Add anyway" to this story |

## 10. Open questions

None. The three draft questions were settled in review: the badges never change the saved build (D13), the reserved line stays (D14), and a confirmation on the product page is #68 (D15).

## Acceptance criteria mapping

| Acceptance criterion | Covered by |
| --- | --- |
| Small client component computes the badge in the browser with `checkCandidate`, reading the build with `useBuild` / `useBuildParts` and the existing parts route; pages stay server-rendered per request (ADR 0003) | Behavior 3, 13–15; Rules › The verdict, Caching and SEO; E12, E25, E35; D3, D6, D12 |
| Server passes `{ id, slot, ruleSpecs }` per builder-category product, limited to `FieldMeta.rules` fields; badge in `ProductCard`'s `children` slot; non-builder products get none | Behavior 2, 7; Rules › What the server sends; Data and interfaces; E36; D1 (adds `name`) |
| Badge only when the build has parts a rule can compare against; a pure helper in `lib/builder` with unit tests (CPU against storage-only: no badge) | Behavior 6; Rules › Comparable parts; E13–E21; D2 |
| Three states plus "In your build"; the product page lists the messages; cards show the label with reasons for screen readers; not color alone | Behavior 4, 8, 10; Rules › Accessibility; Messages and copy; E1–E10, E23, E27–E29; D7 |
| Nothing renders until the saved build has loaded (no hydration mismatch); badge space reserved so cards don't shift | Behavior 6, 9; Rules › Rendering, hydration and layout; E24, E26; D9, D14 |
| Review: badges never change the saved build; only a page that can show a notice may | Behavior 16; Data and interfaces (`useBuildParts` option); E34; D13 |
| Review: state conveyed by text, announced with its product's card (badge outside the link) | Behavior 8a; Rules › Accessibility; E23, E23a; Test plan (component and E2E) |
| Review: badges update when the build changes in another tab through `useBuild`'s `storage` listener | Behavior 15; E35; Test plan (E2E) |
| Review: E2E asserts named parts, not seed counts | E22; Test plan (E2E) |
| Scope: listings, search results and the product page; related and home out | Behavior 1; Out of scope; E31, E32 |
| Unit tests for the helper and the badge states; E2E with Build A on `/motherboard` | Test plan; E22 |
| DoD: empty, loading and error states | Behavior 6, 17; E15, E26, E33 |
| DoD: spec, README and ADRs updated if affected | Data and interfaces › Docs; D12 |
