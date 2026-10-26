# 011 — Plan: grow the seed catalog to 150 parts

Spec: [spec.md](spec.md) · Tasks: [tasks.md](tasks.md) · Issue: #34

## Context

Sprint 3's filters and search (#35–#37) need a catalog where every filter has choices. The 60 parts from spec 005 grow to 150 (+90 new). The existing 60 are not touched. No schema change, no migration, no new seed feature: this is data, one coverage test, one timeout fix and one E2E assertion.

## Summary

- **Data files only grow.** New parts go after the existing entries in the 8 files in `prisma/seed/data/`. Every enum value needed (all sockets, `M2_2230`, `SFX_L`, `SEMI`, 280 mm radiators, `INTEL` GPUs) already exists in `lib/specs/enums.ts`.
- **The coverage test is written last, with every rule from the spec.** Writing it first would leave `pnpm test` red for the whole story. Instead, T1 relaxes the two old upper bounds (55–65 total, 4–8 on sale) that would break as data is added, and T8 replaces them with the spec's rules. Each task then ends green.
- **The test reads the display metadata.** It loops over `builderCategories[c].fields` where `filterable` is true, so Sprint 3's filter fields and the test cannot drift apart.
- **Seed run time:** `writeSeed` has a 60 s transaction timeout; 60 parts took under 30 s on Neon. T1 raises it to 180 s (single transaction kept) and T8 measures the 150-part run.
- **Manufacturer pages:** every new part is checked against its page during its data task (via the `web-fetch` agent). A value that can't be confirmed gets a `// verify:` comment for the owner, as in spec 005; T9 clears them.

## Files

```
prisma/seed/data/*.ts                 90 new parts across 8 files (existing entries unchanged)
prisma/seed/data/coverage.test.ts     T1: relax old bounds; T8: the spec's rules
prisma/seed/write.ts                  T1: transaction timeout 60 s → 180 s, comment updated
e2e/category-page.spec.ts             T2: /cpu?page=99 now lands on /cpu?page=2
CLAUDE.md                             db:seed line: "about 60" → "about 150", spec 011
docs/specs/005-…/spec.md              one-line pointer: 150-part target met by spec 011
docs/prd.md                           open question on the seed catalog: add spec 011
```

## Coverage test (T8)

In `coverage.test.ts`, on the validated parts (defaults filled), reusing `getStockStatus` and the pinned date `"2026-10-26"`.

- **Tables at the top of the file:** `TIERS` per category (the thresholds already in each data file's header comment, in centavos) and a `MIN_PARTS` of 10. A comment says the headers and the table must agree.
- **Size:** 145–155 total; ≥ 10 per category.
- **Brands:** 3–6 per category (CPU: exactly AMD and Intel); no brand above 40% of a category (CPU 60%).
- **Filterable fields, per category:** for each `filterable` field in `builderCategories[category].fields`, collect values over the parts' `specs` (array fields flattened; parts without the field skipped).
  - Boolean, or the field has `options` in the metadata → exact-match: at least `min(3, number of options)` distinct values. Two-value fields (booleans, DDR type, interface, cooler type) → both values, each in ≥ 3 parts. `chipset` (free text) → ≥ 3 values.
  - Other numbers → range: ≥ 4 distinct values; ≥ 3 for `moduleCount`, `m2Slots` and `radiatorSizeMm` (listed in a small `COUNT_LIKE` constant).
  - Failure message names category, field and the values found.
- **Prices:** per category ≥ 3 parts in each tier (≥ 2 for case, PSU, cooler); max price ≥ 3 × min.
- **Stock and sale** (overall and per category, using `getStockStatus`): in stock ≥ 70% overall and ≥ 50% per category; out of stock ≥ 8 in ≥ 4 categories; low stock ≥ 15 in ≥ 5 categories; pre-order ≥ 5 in ≥ 3 categories; 12–20 on sale with a discount of 5–25%; every category has ≥ 1 on-sale part that is not out of stock, and CPU, GPU, memory, storage ≥ 2.
- **Quality:** every new part (not one of the 60 existing SKUs) has non-empty `boxContents` and `warrantyMonths ≥ 12`.
- **Kept as they are:** 1000 W PSU check becomes ≥ 1200 W; the multi-image check (5–6 parts, with 2 and with 3 images); the fixture SKU list, extended with the 37 spec 005 SKUs ("keeps all 60 existing SKUs"); the image-file checks.

## Data

Every new part follows spec 001's naming, unit and rounding rules and its category schema; carries a tier comment (`// budget`); has a manufacturer `sourceUrl`, `boxContents`, `warrantyMonths` and a sample PHP price in centavos; and uses the category placeholder (no `images`). If a candidate has no manufacturer page, or the page lacks a required field, swap in another part of the same tier and role.

Candidate model lines (confirmed against the manufacturer page during each task; exact SKUs and names are chosen then):

| Category | New | Candidates |
| --- | --- | --- |
| CPU | 18 | AM4 ×3: Ryzen 5 5500, Ryzen 7 5700X, Ryzen 7 5800X3D. AM5 ×7: Ryzen 5 7600X, 7 7700, 7 7800X3D, 5 9600X, 7 9700X, 9 9900X, 9 9950X3D. LGA1700 ×6: Core i3-12100F, i5-12400F, i5-13400F, i5-13600K, i7-14700K, i9-14900K. LGA1851 ×2: Core Ultra 5 245KF, Core Ultra 9 285K |
| GPU | 21 | NVIDIA ×12: RTX 5050, 5060 (two brands), 5060 Ti 8GB, 5070 (two), 5070 Ti (two), 5080, 5090, RTX 4070 Super, RTX 3060 12GB. AMD ×7: RX 7600 XT, 7800 XT, 7900 XTX, 9060 XT 8GB, 9060 XT 16GB, 9070, 9070 XT. Intel ×2: Arc A750, Arc A770 16GB. Brands: ASUS, MSI, Gigabyte, Sapphire, Intel (the five already there) |
| Memory | 13 | DDR4 ×5: 1×8 GB, 2×16 GB at 3200 and 3600, 64 GB. DDR5 ×8: 16 GB 1×16 up to 96 GB (2×48), a 4×16 GB kit, speeds 5200 to 8000 (G.Skill Trident Z5 RGB / Neo, Kingston FURY Renegade, Corsair Vengeance, Crucial Pro) |
| Storage | 13 | NVMe ×8: Samsung 990 EVO Plus 2TB, 9100 PRO 2TB (Gen5), WD Blue SN580 250GB, WD_BLACK SN7100 2TB, Crucial T500 1TB, Crucial P310 1TB (M.2 2230), Kingston KC3000 512GB, Crucial P3 Plus 4TB. SATA SSD ×2: Kingston A400 480GB, WD Blue SA510 1TB. HDD ×3: Seagate BarraCuda 4TB, IronWolf 8TB, WD Blue 1TB |
| Motherboard | 10 | AM4 ×2: MSI MAG B550 Tomahawk, Gigabyte X570 AORUS Elite. AM5 ×3: ASRock A620M-HDV/M.2, Gigabyte B650 AORUS Elite AX, a B850 or X670E board. LGA1700 ×3: ASRock H610M-HDV/M.2 DDR4, MSI MAG B760 Tomahawk WiFi, Gigabyte Z790 AORUS Elite AX. LGA1851 ×2: MSI MAG Z890 Tomahawk WiFi, a B860 Micro-ATX board |
| Case | 5 | Fractal North, Cooler Master NR200P (ITX), NZXT H7 Flow, Corsair 5000D Airflow, Lian Li A3-mATX |
| PSU | 5 | Corsair RM1200x SHIFT (≥ 1200 W), a Corsair SF-L unit (SFX-L), MSI MAG A750GL PCIE5, be quiet! Straight Power 12 1000W (Platinum), Corsair CX650M (semi-modular) |
| Cooler | 5 | DeepCool AK620, Thermalright Phantom Spirit 120 SE, Noctua NH-U12A, Arctic Freezer 36, Arctic Liquid Freezer III 280 (third AIO) |

**Stock, sale and pre-order allocation** (new parts only; totals include the existing parts):

| Task | Out of stock | Low stock | Pre-order | On sale |
| --- | --- | --- | --- | --- |
| CPU | 1 | 2 | 1 | 1 |
| GPU | 2 | 2 | 1 | 2 |
| Memory | 0 | 1 | 1 | 1 |
| Storage | 1 | 1 | 1 | 1 |
| Motherboard | 0 | 1 | 1 | 1 |
| Case | 1 | 1 | 0 | 1 |
| PSU | 1 | 0 | 0 | 1 |
| Cooler | 0 | 0 | 0 | 1 |
| **New** | 6 | 8 | 5 | 9 |
| **Total with existing** | 10 | ~19 | 7 | 16 |

Pre-order ship dates fall between 2027-01 and 2027-04. Discounts 5–25%.

## E2E

`e2e/category-page.spec.ts`, "invalid and out-of-range parameters": `/cpu?page=99` now ends at `/cpu?page=2` (26 CPUs, `PAGE_SIZE` 24 in `lib/listing-params.ts`); the comment changes with it. Done in the CPU task, since that is when CPU first has two pages.

## Verification

- Each task: `pnpm lint`, `pnpm typecheck`, `pnpm test`; each data task also runs `pnpm db:seed` on the Neon dev branch and checks the created count.
- T8: `pnpm test` fails with a readable message when a rule is broken (temporarily drop a DDR4 kit to see it) and passes otherwise.
- T9: a second `pnpm db:seed` gives `0 created, 150 updated` with the same row counts; the first full run time is noted against the 180 s timeout. `git diff prisma/seed/data` shows only additions apart from header comments. `grep -r "verify:" prisma/seed/data` finds nothing. `pnpm test:e2e` passes. Browse `/cpu` and `/gpu` (two pages), `/memory?sort=price-asc`, and one pre-order, one sale and one out-of-stock product page.
- After merge: re-seed production per spec 004 "Seeding production".
