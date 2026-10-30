# 028 — Shipping data and fee rules

Status: **Approved** (review changes applied) · Issue: #76 (Sprint 6, Checkout epic; depends on none) · PRD refs: FR-15 (address data), FR-16 (shipping fee by zone and weight, free-shipping threshold); Payments and fulfillment › Fulfillment; AD-9 (seeded now, edited by Admin in Sprint 8); Technical architecture › Data model (`ShippingRate`, `StoreSettings`)

## 1. Summary

This story gives the checkout (#77, #78) the data and the rules it needs before it can show a shipping fee. It adds the `ShippingRate` and single-row `StoreSettings` tables with a **fictional demo store and demo rates**, a versioned **PH address dataset** converted from the PSA's PSGC `2026Q3` publication (which the server also uses to validate addresses), the **region → zone** map, the order **weight** sum, and a pure **`shippingFee`** function in integer centavos. It has no screen: the address form, the fee line and the order come in the next stories.

## 2. Behavior

This story adds no page, so it has no loading, empty or error screens. Each step below says what the data and functions do, including the failure cases the checkout will have to show.

### The address dataset (FR-15)

1. The dataset is a set of generated JSON files under `data/psgc/json/2026Q3/`, **outside `public/`** (D12). A committed script converts the PSA workbook `data/psgc/2026Q3.xlsx` (committed too) into them, and its output is committed. Running the script again on the same workbook gives the same files byte for byte (compact JSON, no whitespace, one trailing newline). The server reads these files, and the browser gets the same files through a route handler (Behavior 8).
2. The files follow the form's four steps: `regions.json`; `provinces/{regionCode}.json` (the provinces of one region); `cities/{provinceCode}.json` (the cities and municipalities of one province, each with its barangays). Codes are the 10-digit PSGC codes as text. A city is `{ code, name, barangays: [{ code, name }] }`. `manifest.json` records `version` ("2026Q3"), `publishedOn` (the workbook's publication date, 2026-09-30), the source file name and the counts per level.
3. **Every region has a province step** (D2). Where PSGC has no province for a place, the dataset adds a **pseudo-province** (`kind: "pseudo"`) so the address always has four levels and the form and the stored address have one shape:
   - **NCR** has no provinces. Its one pseudo-province is "Metro Manila", holding the 16 cities and Pateros (D3).
   - **The 17 highly urbanized cities outside NCR** whose codes sit outside any province (for example City of Cebu, City of Davao) are each their own pseudo-province, with that one city in it.
   - **City of Isabela** and the **Special Geographic Area** are pseudo-provinces because PSGC itself marks them "Not a Province" (Region IX and BARMM).
   - A city whose code sits inside a province's range stays in that province (City of Dagupan in Pangasinan, City of Cotabato in Maguindanao del Norte, and three more), whatever its class.
   - **The 17 independent cities are also listed in their geographic province** (D19). A tested map in code (`independentCityProvinces`, in Rules and edge cases) gives each one's geographic province: City of Cebu, City of Mandaue and City of Lapu-Lapu under Cebu, City of Davao under Davao del Sur, and so on. In that province's `cities/{provinceCode}.json` the city appears as a short entry `{ code, name, independent: true }` with **no barangays**; its barangays are in its own pseudo-province file, `cities/{cityCode}.json` (its pseudo-province code is the city's code, D3). So the output has the data both ways, and #77 decides which the form shows and how it labels it. City of Isabela is not in the map: the PSA puts it in Region IX with no province, and Basilan is in another region. NCR's cities are not in it either.
4. **NIR** (the Negros Island Region, code 18, 2024) is a region like the others, with Negros Occidental, Negros Oriental and Siquijor, plus the independent City of Bacolod as a pseudo-province.
5. **The City of Manila's 14 districts** (PSGC "SubMun" rows) are not a level. Their barangays are listed directly under the City of Manila (897 barangays).
6. Names are cleaned at conversion: surrounding spaces are trimmed, PSA footnote markers such as the "a/" in "City of Lucenaa/" are removed, and "(Not a Province)" is dropped. Everything else is kept as the PSA published it ("City of Cebu", not "Cebu City"). The files list places in code order; sorting for the dropdowns is the form's job (#77).
7. **ZIP is not in PSGC.** It stays a 4-digit text field: exactly four digits, leading zeros kept ("0900" is valid), nothing checked against the place. One shared check, `zipSchema`, is used by the form and the server.
8. **The browser gets the files from a route handler** (D12): `GET /api/psgc/{version}/regions.json`, `/api/psgc/{version}/provinces/{regionCode}.json`, `/api/psgc/{version}/cities/{provinceCode}.json` and `/api/psgc/{version}/manifest.json`. The handler reads the same files the server validation reads, through one shared loader in `lib/psgc`; it never builds a file path from the request. A client loads regions first, then one provinces file after a region is chosen, then one cities file after a province is chosen (a province's barangays are in the same file as its cities, so choosing a city needs no request).
   - A known file answers 200 `application/json` with `Cache-Control: public, max-age=31536000, immutable` (the version is in the URL, so the content never changes).
   - An unknown version, an unknown or malformed code, or any other path answers **404 with `Cache-Control: no-store`** (never an immutable 404, so a file added by a later version isn't hidden). The 404 has no body that names a file path.
   - Only `GET` is served.
9. **Server validation.** `resolveAddress({ regionCode, provinceCode, cityCode, barangayCode })` reads the same files from disk and returns the names of the four places plus the zone, or `null` when any code is unknown or the chain doesn't hold (the province isn't in the region, the city isn't in the province, the barangay isn't in the city). A city counts as in a province when it is in that province's file, or is an independent city the map assigns to that province (Cebu province with City of Mandaue is valid; so is City of Mandaue's own pseudo-province). The server uses the names from the dataset, never names sent by the client. A newer PSGC version is a new folder and a new version constant; orders keep the names they were placed with, so old versions are not needed.

### Zones (FR-16)

10. A **zone** is one of `metro-manila`, `luzon`, `visayas`, `mindanao`. `zoneOfRegion(regionCode)` maps a region to its zone from a table in code, keyed by the 2-digit region code (D5). An unknown region code gives `null`, which the address check treats as invalid. The map is in Rules and edge cases.
11. A test fails when any region in the dataset has no zone, and when the map names a region the dataset doesn't have.

### Order weight

12. `orderWeightGrams(lines)` is the sum of `weightGrams × quantity` over the lines it is given. The caller passes every purchasable cart line: single items and each part of a build group (a build group is its `CartItem` rows, so there is nothing special to expand). The same product in a single line and in a group counts on both lines. An empty list weighs 0.

### The shipping fee (FR-16)

13. `shippingFee({ method, zone, weightGrams, subtotal }, rates, settings)` returns the fee in centavos, or says it can't. In this order:
    1. **Pickup** (`method: "pickup"`): fee 0, whatever the zone or rates.
    2. **No rates for the zone:** delivery is not available there: `{ ok: false, reason: "no-rate" }` (D7). A zone has no rates when it has no tiers, or when the order is heavier than every bounded tier and the zone has no open-ended tier.
    3. **Free shipping:** the settings' threshold is set and `subtotal ≥ threshold` (equal is free): fee 0.
    4. **Otherwise** the **smallest tier whose `maxWeightGrams ≥ weightGrams`**; if the order is heavier than every bounded tier, the zone's **open-ended tier** (`maxWeightGrams` null). A weight of 0 takes the smallest tier.
14. The function does not depend on the order of the rates it gets, reads no database, and does not read the pickup-enabled setting: whether pickup is offered is the checkout's decision (D15).
15. `subtotal` is the merchandise total at the prices the shopper pays (`effectivePrice`), before any voucher (D14). Weights, subtotal and fees are whole numbers; a non-integer or negative input is a bug in the caller and throws.

### The tables and the seed

16. `ShippingRate` holds the tiers (zone, `maxWeightGrams` or null for the open-ended tier, fee in centavos). `StoreSettings` holds one row: free-shipping threshold (null = off), pickup enabled, store address, store hours, store info and order expiry hours (default 24, FR-24). COD limits come with FR-25 (Sprint 7).
17. `pnpm db:seed` creates the settings row **only when it is missing** and inserts the demo rates **only when `ShippingRate` is empty** (D10), so it never overwrites what Admin sets, in the same way it keeps stock and prices. Both sets of values are in a seed data file whose comment says they are demo values. The seed prints what it did for each table.
18. `pnpm db:seed --reset` and `resetCatalog()` name both new tables in their `TRUNCATE`, so a reset clears them (and the seed then refills the demo values). `--reset` stays refused on production as today.
19. A shopper sees none of this yet. The checkout stories read the rates and settings with `getShippingConfig()`, look up the zone with `resolveAddress`, and call `shippingFee`.

## 3. Examples

Weights, prices and fees below are real seed values or the demo values in section 6. Fees are centavos; ₱ in brackets.

Seed parts used: **AMD Ryzen 5 7600** ₱11,495.00, 450 g. **Lian Li LANCOOL 216 Black** ₱5,795.00, 9,000 g. **Build A** (spec 001's compatible build, `buildA` in `test-support/seed-parts.ts`): Ryzen 5 7600 450 g, ASUS ROG Strix B650-A Gaming WiFi 1,800 g, Corsair Vengeance DDR5-6000 32 GB 150 g, Samsung 990 PRO 1TB 60 g, ASUS Dual GeForce RTX 4060 OC 8GB 1,100 g, LANCOOL 216 9,000 g, Cooler Master MWE 550 Bronze V2 2,000 g, Thermalright Peerless Assassin 120 SE 1,300 g: **15,860 g**, **₱69,060.00** (6,906,000 centavos) at list prices.

### Shipping fee (`shippingFee`, unit)

Rates are the demo rates unless an example says otherwise; the tests pass them as fixtures, not from the seed.

| # | Input | Expected |
| --- | --- | --- |
| F1 | pickup, Mindanao, 15,860 g, subtotal 6,906,000 | `ok`, fee 0, basis `pickup` |
| F2 | delivery, Metro Manila, Ryzen 5 7600 × 1 (450 g, 1,149,500) | fee 12000 [₱120], basis `rate` |
| F3 | delivery, Metro Manila, weight 1,000 / 1,001 / 3,000 / 3,001 | 12000 / 18000 / 18000 / 30000 |
| F4 | delivery, Metro Manila, weight 10,000 / 10,001 / 20,000 / 20,001 | 30000 / 45000 / 45000 / 65000 (open-ended tier) |
| F5 | delivery, weight 0 | The smallest tier of the zone (12000 in Metro Manila) |
| F6 | delivery, Build A (15,860 g, 6,906,000), each zone | Metro Manila 45000, Luzon 65000, Visayas 90000, Mindanao 100000 |
| F7 | delivery, Mindanao, LANCOOL 216 × 3 (27,000 g) | 145000 [₱1,450], the open-ended tier |
| F8 | delivery, Visayas, 9,000 g (LANCOOL 216 × 1) | 58000 [₱580] |
| F9 | threshold 7,500,000; delivery, Luzon, 15,860 g; subtotal 7,500,000 | Fee 0, basis `free-shipping` (equal is free) |
| F10 | the same with subtotal 7,499,999 | 65000, basis `rate` |
| F11 | threshold null (off); subtotal 20,000,000 | The tier fee, never free |
| F12 | rates have no Mindanao tiers; delivery, Mindanao, any weight, any subtotal | `{ ok: false, reason: "no-rate" }` |
| F13 | the same rates; pickup, Mindanao | Fee 0, `ok` |
| F14 | Luzon has only bounded tiers (no open-ended); weight above the last bound | `no-rate` |
| F15 | rates in a shuffled order, then sorted | Same result both ways (F3, F4 re-run) |
| F16 | the same Mindanao rates as F12 but threshold met | `no-rate` (D7) |
| F17 | weight −1, 1.5, `NaN`; subtotal −1 or 1.5; fee or limit not an integer | Throws (a caller bug) |

### Order weight (`orderWeightGrams`, unit)

| # | Lines | Expected |
| --- | --- | --- |
| W1 | none | 0 |
| W2 | Ryzen 5 7600 × 2 | 900 |
| W3 | the eight parts of Build A, each × 1 (a build group) | 15,860 |
| W4 | Ryzen 5 7600 × 2 (single) + Build A group | 16,760 |
| W5 | Ryzen 5 7600 × 1 (single) + Build A group (which has its own Ryzen 5 7600) | 16,310 (both lines count) |
| W6 | weight 450.5, quantity 0, quantity −1, quantity 1.5 | Throws |

### Zone map (`zoneOfRegion`, unit)

| # | Input | Expected |
| --- | --- | --- |
| Z1 | each of the 18 region codes in the 2026Q3 `regions.json` | A zone (table in Rules and edge cases) |
| Z2 | `"1300000000"` (NCR) | `metro-manila`. The map is keyed by the 2-digit code; `zoneOfRegion` takes the region's 10-digit code and uses its first two digits |
| Z3 | `"1800000000"` (NIR) | `visayas` |
| Z4 | `"2000000000"`, `""`, `"abc"` | `null` |
| Z5 | a region added to the map but not in the dataset | The coverage test fails |
| Z6 | a region in the dataset with no map entry | The coverage test fails |

### Address data (`data/psgc/json/2026Q3`, unit/integrity)

| # | Case | Expected |
| --- | --- | --- |
| A1 | Counts in `manifest.json` and in the files | 18 regions; 102 provinces (82 provinces plus 20 pseudo-provinces); 1,642 cities and municipalities (149 cities, 1,493 municipalities); 42,010 barangays. The files match the manifest |
| A2 | Region NCR (1300000000) | One province: "Metro Manila" (code 1300000000, pseudo) with 17 places: 16 cities and Pateros (1381701000). Quezon City is 1381300000 |
| A3 | City of Manila (1380600000) | 897 barangays directly under it; "Barangay 1" is 1380601001; no district level |
| A4 | Region VII provinces | Includes the pseudo-province "City of Cebu" (0730600000) whose one place is City of Cebu (0730600000) |
| A5 | Region XI (Davao Region) | Includes the pseudo-province "City of Davao" (1130700000) |
| A6 | City of Dagupan (0105518000) | In the places of Pangasinan, not a pseudo-province. City of Cotabato (1908703000) is in Maguindanao del Norte (1908700000) |
| A7 | Region IX and BARMM | Pseudo-provinces "City of Isabela" (0990100000, one place 0990101000) and "Special Geographic Area" (1999900000, 8 municipalities) |
| A8 | NIR (1800000000) | Present, with Negros Occidental (1804500000), Negros Oriental (1804600000), Siquijor (1806100000) and the pseudo-province "City of Bacolod" (1830200000) |
| A9 | Name clean-up | "City of Lucenaa/" is "City of Lucena" (0431200000, a pseudo-province in Region IV-A); no name has surrounding spaces, a footnote marker or "(Not a Province)" |
| A10 | Every code | Unique within its level; every place has an existing parent; every province has a file in `cities/`; every region a file in `provinces/` |
| A11 | Converter run twice on the workbook | Identical output |
| A12 | The dataset's version | `manifest.version` equals the version constant and the folder name |
| A13 | Cebu province (0702200000) places | Lists its own cities and municipalities with barangays, plus short entries `{ independent: true }` and no barangays for City of Cebu (0730600000), City of Lapu-Lapu (0731100000) and City of Mandaue (0731300000). Their barangays are in `cities/0730600000.json`, `cities/0731100000.json` and `cities/0731300000.json` |
| A14 | The 17 independent cities | Each appears as its own pseudo-province and once as a short entry in its geographic province (the map in Rules and edge cases). City of Bacolod (1830200000) is also listed in Negros Occidental (1804500000); City of Davao (1130700000) in Davao del Sur (1102400000) |
| A15 | City of Isabela, the Special Geographic Area, the NCR cities | Not listed in any other province |
| A16 | The independent-city map against the dataset | Fails when a pseudo-province city outside NCR, Isabela and the Special Geographic Area has no entry; when an entry names a city or province that isn't in the dataset; or when the province is in a different region from the city |
| A17 | Largest generated file | The converter prints the largest `cities/` file (name, raw and gzipped bytes). Measured by the converter on the 2026Q3 workbook: the largest is Metro Manila's, 75,469 bytes raw, 11,507 gzipped (Node's default gzip level); Iloilo is the largest gzipped, 72,417 raw, 14,211 gzipped (D1). The integrity test fails above 120,000 bytes raw so a future quarter can't quietly grow a file |

### Converter (unit, on a small fixture sheet in the workbook's row shape, plus the real workbook where noted)

| # | Case | Expected |
| --- | --- | --- |
| C1 | A fixture City of Manila with two districts (Tondo I/II with 3 barangays, Binondo with 2) | All 5 barangays are under the City of Manila, none under a district, and no district is written. On the real workbook: City of Manila has **897** barangays (the integrity test asserts it) |
| C2 | Names with surrounding spaces: `"City of Cebu "`, `"Zone 6 Pob. "`, a barangay `"Santa Elena "` | Written as `"City of Cebu"`, `"Zone 6 Pob."`, `"Santa Elena"`. No name in the output has leading or trailing space |
| C3 | The footnote marker: `"City of Lucenaa/"` | Written as `"City of Lucena"`. A name with a `/` inside (`"Tondo I/II"`) is unchanged |
| C4 | `"City of Isabela (Not a Province)"` | The pseudo-province is named "City of Isabela" |
| C5 | A fixture region with a city and no province row (NCR shape) | One pseudo-province for the region ("Metro Manila" for NCR), holding the city |
| C6 | A fixture independent city (no province row with its prefix) | Its own pseudo-province, plus a short entry in the geographic province the map names |
| C7 | A barangay with no parent city; a row with an unknown level; a duplicate code | The converter stops, naming the code and name, and writes nothing |
| C8 | Every name changed by cleaning | Each change beyond trimming spaces is listed in the converter's output (old → new); names that only lost spaces are counted (there are about 2,850 in the raw sheet, so listing them would bury the real changes) |
| C9 | A code cell stored as a number (730600000), a text code ("0702200000"), a footnote, a blank | "0730600000", "0702200000", and null for the footnote and the blank: the leading zero is restored, and a non-code row is never mistaken for a place |

### Address validation (`resolveAddress`, `zipSchema`, unit)

| # | Input | Expected |
| --- | --- | --- |
| V1 | Region 1300000000, province 1300000000, city 1381300000 (Quezon City), a barangay of Quezon City | Names for the four places, zone `metro-manila` |
| V2 | Region 1100000000, province 1130700000, city 1130700000 (City of Davao), a barangay of Davao | Zone `mindanao` |
| V3 | A barangay of Makati with Quezon City's city code | `null` |
| V4 | Cebu province (0702200000) with a Region VIII code | `null` |
| V5 | An unknown code, a 9-digit code, `""`, a number instead of text, a missing field | `null`. Extra fields are ignored |
| V6 | Names sent by the client | Ignored; the result carries the dataset's names |
| V7 | ZIP `"1100"`, `"0900"` | Valid ("0900" keeps its zero) |
| V8 | ZIP `"110"`, `"11000"`, `"11 00"`, `"abcd"`, `""`, `" 1100"`, the number `1100` | Invalid. The check does not trim: the form trims what the shopper types before it checks |
| V9 | Region VII, province Cebu (0702200000), city City of Mandaue (0731300000), a barangay of Mandaue | Valid: names for the four places (province "Cebu"), zone `visayas` |
| V10 | The same with province City of Mandaue (0731300000) | Valid: province named "City of Mandaue" |
| V11 | Province Bohol with City of Mandaue; province Cebu with City of Davao | `null` (the map says Cebu, not Bohol; Davao belongs to Davao del Sur) |

### The data route (`/api/psgc/…`, Playwright API request against `pnpm start`)

| # | Request | Expected |
| --- | --- | --- |
| R1 | `GET /api/psgc/2026Q3/regions.json` | 200, JSON, `Cache-Control: public, max-age=31536000, immutable`, 18 regions; the body equals the file on disk |
| R2 | `GET /api/psgc/2026Q3/provinces/1300000000.json` and `/cities/1300000000.json` | 200 with the immutable header; the cities file has 17 places |
| R3 | `GET /api/psgc/2026Q3/manifest.json` | 200, `version: "2026Q3"` |
| R4 | `GET /api/psgc/2099Q1/regions.json`; `/cities/9999999999.json`; `/provinces/abc.json` | 404, `Cache-Control: no-store`, no file path in the body |
| R5 | `GET /api/psgc/2026Q3/../../package.json`, `/api/psgc/2026Q3/cities/..%2F..%2Fpackage.json`, `/api/psgc/2026Q3/regions.json/x` | 404; nothing outside the dataset is ever read |
| R6 | `POST /api/psgc/2026Q3/regions.json` | 405 |
| R7 | On a Vercel preview deploy (the plan's first task, D20) | One address-file request (R1) and one server-side `resolveAddress` call (V1) both succeed |

### Tables and seed (integration, `*.db.test.ts`)

| # | Case | Expected |
| --- | --- | --- |
| S1 | `db:seed` on a database with neither table filled | 20 `ShippingRate` rows (4 zones × 5 tiers) and the one `StoreSettings` row with the demo store |
| S2 | Admin changed Metro Manila's first tier to 13500 and the threshold to null, then `db:seed` | Both unchanged; no row added; the output says the rates and settings were kept |
| S3 | `StoreSettings` exists, `ShippingRate` is empty | Rates inserted; the settings row is left as it is |
| S4 | `db:seed --reset` | Both tables emptied and refilled with the demo values; `resetCatalog()` empties both |
| S5 | A second `StoreSettings` row (id 2) | Refused by the database |
| S6 | Two open-ended tiers in one zone; two tiers with the same limit in one zone; `maxWeightGrams` 0 or negative; a negative fee; threshold 0 or negative; `orderExpiryHours` 0 | Each refused by the database |
| S7 | The demo values | Every zone has four bounded tiers and one open-ended tier; limits and fees rise tier by tier; at every tier the fee rises zone by zone (Metro Manila < Luzon < Visayas < Mindanao) |
| S8 | Seed validation | A seed file with an unsorted or duplicate tier, a zone without an open-ended tier, or a negative fee stops the seed before anything is written |

## 4. Rules and edge cases

### Region → zone map

Keyed by the 2-digit region code (the first two digits of the region's PSGC code):

| Zone | Regions |
| --- | --- |
| `metro-manila` | 13 NCR |
| `luzon` | 14 CAR, 01 I, 02 II, 03 III, 04 IV-A, 17 MIMAROPA, 05 V |
| `visayas` | 06 VI, 18 NIR, 07 VII, 08 VIII |
| `mindanao` | 09 IX, 10 X, 11 XI, 12 XII, 16 XIII, 19 BARMM |

This is the issue's map: 1 + 7 + 4 + 6 = 18 regions. MIMAROPA includes Palawan and Romblon, which are islands; the map still puts them in Luzon, as the issue says.

### PSGC 2026Q3 facts the converter relies on (checked against the workbook)

- Sheet "PSGC"; columns: 10-digit code, name, correspondence code, geographic level (`Reg`, `Prov`, `City`, `Mun`, `SubMun`, `Bgy`), city class, status. 43,769 data rows plus one footnote row (not a place; ignored).
- A city or municipality belongs to the province whose code shares its first five digits. If no province row has that prefix, it is independent: NCR cities and Pateros (prefix 13…), 17 highly urbanized cities elsewhere (Baguio, Angeles, Olongapo, Lucena, Puerto Princesa, Iloilo, Bacolod, Cebu, Lapu-Lapu, Mandaue, Tacloban, Zamboanga, Cagayan de Oro, Iligan, Davao, General Santos, Butuan), the City of Isabela and the Special Geographic Area's 8 municipalities. Dagupan, Santiago, Naga, Ormoc and Cotabato share their province's prefix and stay in it.
- Two rows have no level and are PSA's own "not a province" parents: `0990100000` "City of Isabela (Not a Province)" and `1999900000` "Special Geographic Area".
- Barangays follow their city or district in the sheet; a district's barangays belong to the City of Manila.
- About 2,850 names have trailing spaces in the raw sheet (the workbook reader already trims them, so the converter's own trim changes nothing today and stays as a guard); one city name ends in a footnote marker.
- 84 codes are stored as numbers in the sheet, which loses a leading zero (Puerto Princesa, many Iligan barangays). The converter reads them back as 10-digit text (C9). Skipping them would have left holes: the first run stopped on a missing province (Maguindanao del Norte). Cleaning trims spaces and removes **only a trailing lowercase letter followed by `/`** (the PSA's footnote style), so a name with a `/` inside, like "Tondo I/II", is untouched. The converter lists every name it changed (C8).
- Any row the converter can't place (unknown level, no parent, duplicate code) stops it with the code and name. It never writes half a dataset.

### Independent cities and their geographic province (`independentCityProvinces`)

A map in code (`lib/psgc/independent-cities.ts`), from the city's code to the code of the province it lies in. Checked against the 2026Q3 workbook: every city exists, every province exists, and each pair is in the same region (A16).

| City (code) | Geographic province (code) |
| --- | --- |
| City of Baguio (1430300000) | Benguet (1401100000) |
| City of Angeles (0330100000) | Pampanga (0305400000) |
| City of Olongapo (0331400000) | Zambales (0307100000) |
| City of Lucena (0431200000) | Quezon (0405600000) |
| City of Puerto Princesa (1731500000) | Palawan (1705300000) |
| City of Iloilo (0631000000) | Iloilo (0603000000) |
| City of Bacolod (1830200000) | Negros Occidental (1804500000) |
| City of Cebu (0730600000) | Cebu (0702200000) |
| City of Lapu-Lapu (0731100000) | Cebu (0702200000) |
| City of Mandaue (0731300000) | Cebu (0702200000) |
| City of Tacloban (0831600000) | Leyte (0803700000) |
| City of Zamboanga (0931700000) | Zamboanga del Sur (0907300000) |
| City of Cagayan De Oro (1030500000) | Misamis Oriental (1004300000) |
| City of Iligan (1030900000) | Lanao del Norte (1003500000) |
| City of Davao (1130700000) | Davao del Sur (1102400000) |
| City of General Santos (1230800000) | South Cotabato (1206300000) |
| City of Butuan (1630400000) | Agusan del Norte (1600200000) |

The map is hand-made (PSGC doesn't give it) and ordinary geography; a new quarter that makes another city independent fails A16 until the map gets an entry.

### Tiers

- A zone's tiers are bounded tiers (`maxWeightGrams` a whole number above 0) and at most one open-ended tier (null). The open-ended tier is the top: it only applies above every bounded tier.
- A weight equal to a tier's limit belongs to that tier (≤).
- The same limit twice in one zone, or a second open-ended tier, is refused by the database (S6) and by seed validation (S8).
- Fees are whole centavos, 0 or more. A fee of 0 is allowed (a free tier).

### Store settings

- One row, `id = 1` (D11). `freeShippingThreshold` is null (off) or a whole number of centavos above 0. `orderExpiryHours` is a whole number of 1 or more.
- `storeAddress`, `storeHours` and `storeInfo` are free text, line breaks allowed (D13). The pickup screens show them as written.

### Data

- Everything in this story is data and pure functions, plus the data route. Nothing here reads cookies, so static pages stay static (ADR 0003). The shipping tables are read per request by the checkout and are not cached in this story.
- **The dataset must be inside every serverless function that reads it.** Files outside `public/` are not deployed with a function unless traced, so `next.config.ts` lists `data/psgc/json/**` in `outputFileTracingIncludes` for the data route and for each route whose code calls `resolveAddress` (D12). This story adds the data route and the temporary proof route (D20); #77 and #78 add the keys for the checkout routes they create, and their specs say so.
- `ShippingRate` and `StoreSettings` do not reference products, so `TRUNCATE … CASCADE` from `Product` wouldn't touch them; the reset names them (Behavior 18). Add them to the seed's `writeSeed` truncate and to `resetCatalog()`.
- The migration is checked like spec 025's: the `ShippingRate` partial unique index is declared in `schema.prisma` (the `partialIndexes` preview feature is already on), so `migrate dev` doesn't drop it; the `CHECK`s are migration-only and are covered by the database tests (S5, S6), not by `db:drift`.
- Weight is `Product.weightGrams` as it is, with no packaging allowance (D9).
- `getShippingConfig()` throws when the single `StoreSettings` row is missing. That is a setup error (the seed wasn't run), not a state a shopper can reach, so it is not a result value. No rates is a valid state and returns an empty list.

## 5. Messages and copy

This story adds no storefront copy. These strings exist:

| Where | Text |
| --- | --- |
| Seed output, rates | "Shipping rates: 20 added." or "Shipping rates: kept (already set)." |
| Seed output, settings | "Store settings: created." or "Store settings: kept (already set)." |
| Seed validation errors | "Shipping seed: {zone} has two open-ended tiers.", "…is missing an open-ended tier.", "…tier limits must rise: {previous} then {next}.", "…fee must be a whole number of centavos, 0 or more.", "…weight limit must be a whole number of grams above 0.", "Shipping seed: {zone} has no tiers.", and for the store: "…the free-shipping threshold must be null or a whole number of centavos above 0.", "…the order expiry must be a whole number of hours, 1 or more.", "…the store {address, hours, info} is empty." |
| Converter | "PSGC {version}: wrote {regions} regions, {provinces} provinces, {cities} cities and municipalities, {barangays} barangays to {folder}." then "Largest file: {file}, {raw} bytes ({gzip} gzipped).", "Read {n} codes stored as numbers.", "Trimmed spaces from {n} names." and one line per other change, "Cleaned: {old} → {new}." Error: "PSGC: row {code} {name}: {problem}." |
| Data route | A 404 has an empty body (no copy). |

The **demo store** below is stored in `StoreSettings` and will appear on the pickup screens (#77) and emails. It is fictional on purpose and says so. Settled in review.

| Field | Demo value |
| --- | --- |
| Address | "PC Silicon Demo Store" / "Unit 12, Demo Plaza, 123 Sample Street" / "Barangay Sample, Quezon City" / "Metro Manila 1100" |
| Hours | "Mon–Sat 10:00 AM–7:00 PM" / "Sun 11:00 AM–5:00 PM" / "Closed on public holidays" |
| Info | "Demo store for a portfolio project. This is not a real shop and no order is fulfilled. Questions: hello@pcsilicon.example" |
| Pickup enabled | Yes |
| Order expiry | 24 hours |

The email address uses the reserved `.example` domain, and there is no phone number, so no real person or business can be reached. The street, plaza and barangay are made up; Quezon City and ZIP 1100 are real but the address as a whole is not.

## 6. Data and interfaces

### Demo shipping values

**These are demo values, not real courier rates.** The seed data file carries a comment saying so. The tiers fit the seed catalog: a CPU is 450 g, a GPU about 1.1 kg, a case up to 15 kg, and a full build about 16 kg (Build A) to 27 kg.

Fees in pesos (centavos in brackets in the seed file):

| Zone | ≤ 1 kg | ≤ 3 kg | ≤ 10 kg | ≤ 20 kg | Over 20 kg (open-ended) |
| --- | --- | --- | --- | --- | --- |
| Metro Manila | ₱120 (12000) | ₱180 (18000) | ₱300 (30000) | ₱450 (45000) | ₱650 (65000) |
| Luzon | ₱150 (15000) | ₱240 (24000) | ₱420 (42000) | ₱650 (65000) | ₱950 (95000) |
| Visayas | ₱190 (19000) | ₱320 (32000) | ₱580 (58000) | ₱900 (90000) | ₱1,300 (130000) |
| Mindanao | ₱210 (21000) | ₱350 (35000) | ₱650 (65000) | ₱1,000 (100000) | ₱1,450 (145000) |

Limits are 1,000 / 3,000 / 10,000 / 20,000 grams.

**Free-shipping threshold: ₱75,000.00 (7,500,000 centavos)** on the merchandise subtotal. Reason: a mid-range build such as Build A (₱69,060) still pays (₱450 in Metro Manila), so the weight tiers are visible in the demo, while a larger build ships free; most single parts are below it and pay. A lower threshold would make almost every build free and hide the top tiers.

### Schema (one migration)

- **`ShippingZone`** enum: `METRO_MANILA`, `LUZON`, `VISAYAS`, `MINDANAO`.
- **`ShippingRate`**: `id`, `zone`, `maxWeightGrams` (nullable; open-ended tier), `fee` (centavos), `createdAt`, `updatedAt`. Unique on (`zone`, `maxWeightGrams`), and a partial unique index on `zone` where `maxWeightGrams` is null (a plain unique treats nulls as different). `CHECK maxWeightGrams > 0`, `CHECK fee >= 0` (raw SQL).
- **`StoreSettings`**: `id` (integer, default 1, `CHECK id = 1`), `freeShippingThreshold` (nullable, `CHECK > 0`), `pickupEnabled` (default true), `storeAddress`, `storeHours`, `storeInfo` (text), `orderExpiryHours` (default 24, `CHECK >= 1`), `updatedAt`.

### Pure code (no database, no `next`)

- `lib/shipping/zones.ts`: `ShippingZone` (the four strings), `zoneOfRegion(regionCode): ShippingZone | null`, the map.
- `lib/shipping/weight.ts`: `orderWeightGrams(lines: { weightGrams, quantity }[]): number`.
- `lib/shipping/fee.ts`: `shippingFee(input, rates, settings): ShippingFeeResult`, where `input = { method: "delivery" | "pickup", zone, weightGrams, subtotal }`, `rates = { zone, maxWeightGrams: number | null, fee }[]`, `settings = { freeShippingThreshold: number | null }`, and `ShippingFeeResult = { ok: true, fee, basis: "pickup" | "free-shipping" | "rate" } | { ok: false, reason: "no-rate" }`.
- `lib/psgc/`: `PSGC_VERSION = "2026Q3"`, the file types (`Region`, `Province` with `kind: "province" | "pseudo"`, `City` as `{ code, name, barangays }` or the short `{ code, name, independent: true }`), `zipSchema`, and `independentCityProvinces` (`lib/psgc/independent-cities.ts`).

### Server

- `lib/psgc` file loader (server-only): the one place that maps a version and a file kind plus code to a file under `data/psgc/json/{version}/`, with the codes checked against `^\d{10}$` and the kind against a fixed list. The data route and `resolveAddress` both use it.
- `app/api/psgc/[version]/[...file]/route.ts` (`GET` only): Behavior 8. 200 with the immutable `Cache-Control`; every miss is 404 with `no-store`.
- `resolveAddress(codes)` (server-only): returns `{ region, province, city, barangay, zone }` (each a `{ code, name }`, plus the zone) or `null`.
- `getShippingConfig()`: the rates and settings rows, fresh per call, mapped to the types above.
- `next.config.ts`: `outputFileTracingIncludes` for `data/psgc/json/**` on the data route and the proof route (Rules › Data). No `headers()` entry: the route sets its own header.
- A **temporary proof route** (`app/api/psgc-proof/route.ts`) that calls `resolveAddress` on a fixed address, for the preview check in D20. It is deleted before the story merges.

### Scripts and seed

- `pnpm psgc:convert`: the converter (reads the workbook path, writes `data/psgc/json/{version}/`, prints the counts, the largest file and the cleaned names). The workbook `data/psgc/2026Q3.xlsx` is committed with it.
- `prisma/seed/data/shipping.ts`: the demo store and rates, validated before any write; `writeSeed` gains the two steps and the reset names the tables.

### Docs

- CLAUDE.md: shipping and PSGC paragraph (tables, seed rule, dataset path and version, zone map, `shippingFee`). README: the seed notes and the new script. The `db:seed` line in CLAUDE.md says the seed also keeps shipping rates and store settings.
- ADR 0008, "Serve PH address data as versioned JSON through a route handler" (D1, D2, D12, D19, D20), written with the plan. It records: JSON outside `public/`; one loader shared by the server and the route; the immutable header set by the route; `outputFileTracingIncludes`; and the preview-deploy proof.
- PRD: no change needed; its `ShippingRate` and `StoreSettings` rows match. Spec and issue are the source for the `StoreSettings` column list.

## 7. Test plan

| Level | What | Examples |
| --- | --- | --- |
| Unit (Vitest) | `shippingFee`: pickup, threshold boundary and off, every tier boundary, every zone, open-ended tier, no rates, order-independence, invalid input | F1–F17 |
| Unit | `orderWeightGrams` | W1–W6 |
| Unit | Zone map and its coverage test against the committed `regions.json` | Z1–Z6 |
| Unit | Converter transform on a small fixture sheet (rows in the workbook's shape): Manila keeps all its barangays, trimmed names, footnote markers removed (`"City of Lucenaa/"`, trailing-space case), NCR and independent-city pseudo-provinces, dangling parent | C1–C9 |
| Unit | Dataset integrity on the committed files: counts against the manifest, City of Manila has 897 barangays, unique codes, parents exist, no untrimmed name or footnote marker, file size ceiling, spot checks on real places | A1–A10, A12, A17, C1 |
| Unit | Independent-city map against the dataset, and the short entries in the geographic provinces | A13–A16 |
| Unit | `resolveAddress` and `zipSchema` | V1–V11 |
| Unit | Demo values and their validator | S7, S8 |
| Integration (`*.db.test.ts`) | Constraints; seed keeps existing rows; reset empties and refills; `resetCatalog()` names both tables; `getShippingConfig` mapping | S1–S6 |
| Manual | Running the converter again leaves `git status` clean (A11) | A11 |
| E2E (Playwright, API request) | The data route against `pnpm start` (the CI build): files, header, 404s with `no-store`, traversal attempts, 405 | R1–R6 |
| Preview deploy (first task of the plan) | One address-file request and one server-side `resolveAddress` call both work on Vercel, before anything else is built | R7, D20 |

There is no UI to test. The checkout stories (#77, #78) cover the form and the fee line end to end.

## 8. Out of scope

| What | Owner |
| --- | --- |
| The address form (dropdowns, street, ZIP field), the fee line, free-shipping message, pickup option | #77 |
| `Address` and address book | #77 for checkout's address, Accounts (#65) for the book |
| `Order` fields (`shippingFee`, zone and weight snapshots, address snapshot), refusing pickup when disabled, re-checking the fee when the order is placed | #78 |
| COD limits and allowed zones | FR-25, Sprint 7 |
| Editing rates and settings in the admin panel | AD-9, Sprint 8 |
| What a voucher does to the free-shipping threshold | Vouchers (FR-17), Sprint 7 (D14) |
| Courier rate APIs, dimensional or packaging weight, delivery estimates | Not planned |
| Checking a ZIP against the place, or ZIP lookup | Not planned (PSGC has no ZIP) |
| Updating PSGC to a newer quarter | Manual: new folder, new version constant, rerun the converter |
| Rate limiting | #64 |
| The `outputFileTracingIncludes` keys for the checkout routes that call `resolveAddress`, and showing independent cities under their geographic province (labels, which path the form offers) | #77, #78 |

## 9. Decisions

- **D1 — One folder per PSGC version, one file per province for cities and barangays.** Measured on the 2026Q3 workbook with the planned shape (`{ code, name, barangays: [{ code, name }] }`, compact JSON): 102 `cities/` files, 1.81 MB raw in total. The **largest is Metro Manila's: 75,469 bytes raw, 11,507 gzipped** (1,715 barangays). Iloilo is the largest gzipped: 72,417 raw, 14,211 gzipped (1,721 barangays). A shopper loads at most three small files. *Rejected:* one file for everything (1.8 MB for every checkout); one barangay file per city (1,655 files and an extra request for every city choice).
- **D2 — Every region has a province step, using pseudo-provinces.** The form, the stored address and `resolveAddress` have one shape of four levels. *Rejected:* skipping the step for NCR and independent cities (two address shapes, `provinceCode` sometimes null). Independent cities are their own pseudo-province entries (for example "City of Cebu"), the way the PSA lists them, and are also listed in their geographic province (D19), so the form can offer either.
- **D3 — Pseudo-province codes are real PSGC codes.** A city that is its own pseudo-province reuses its own code; Isabela and the Special Geographic Area use the PSA's own parent rows; NCR's "Metro Manila" reuses the region's code. A code is unique within its level, and the validator checks each level in its own file, so reuse across levels is safe. *Rejected:* invented codes that appear in no PSA table.
- **D4 — Manila's districts are left out.** PSA says they aren't official municipalities (Notes 1) and a shopper picks a barangay of the City of Manila. *Rejected:* a district step only for Manila.
- **D5 — The zone map uses the region code, not the name.** PSA renames regions (NIR is new in 2024); codes are stable. *Rejected:* matching names.
- **D6 — `shippingFee` returns a result object.** "No rates" is a data state the checkout must show ("we can't deliver there yet"), not a bug. *Rejected:* throwing for it (callers would catch what they should handle); returning `null` (no reason, easy to treat as free).
- **D7 — A zone with no rates means no delivery, even above the free-shipping threshold.** The issue lists the threshold before the tier lookup and says nothing about free shipping to an unserved zone; this puts one check before it. *Rejected:* free shipping to a zone Admin hasn't set up (it would deliver where the shop didn't enable delivery). This differs from the issue's order; the review accepted it.
- **D8 — Smallest tier with `maxWeightGrams ≥ weight`, and weight 0 takes the smallest tier.** It is the issue's rule. An empty order can't reach checkout anyway.
- **D9 — The product weight is used as it is.** `Product.weightGrams` is the weight in the seed (boxed, per the seed comments) and the PRD has no packaging allowance. *Rejected:* adding a per-order packaging weight, which no requirement asks for.
- **D10 — Rates are seeded only when `ShippingRate` is empty; the settings row only when missing.** A per-zone refill would bring back a tier Admin deleted. The cost: if Admin deletes every tier, the next seed refills the demo ones. Seeding is not part of a deploy, so this only happens on a deliberate run. *Rejected:* upserting by (zone, limit), which would overwrite Admin's fees.
- **D11 — `StoreSettings` is one row with a fixed `id` of 1 and a `CHECK`.** The database enforces "single row". *Rejected:* trusting the app to insert once.
- **D12 — JSON outside `public/`, served by a route handler that reads the same files as the validation (review decision).** The files live in `data/psgc/json/{version}/`. One loader reads them for both `GET /api/psgc/{version}/…` (which sets `Cache-Control: public, max-age=31536000, immutable` itself) and `resolveAddress`, so the browser and the server can't see different data. The version in the URL is what makes forever-caching safe. `outputFileTracingIncludes` puts the files into the data route and into each route that validates addresses; ADR 0008 records this. Guards: the loader only builds paths from a fixed list of kinds and `^\d{10}$` codes, misses are 404 with `no-store`. *Rejected:* serving from `public/` and reading it again on the server (on Vercel `public/` files are served by the CDN and aren't guaranteed to be in the function's files, so the server would depend on something the platform doesn't promise); a database table of places (43,000 rows to seed and query; no gain over files); one route per level (more handlers for one job).
- **D13 — Store address, hours and info are free text.** The pickup screens only show them. *Rejected:* a structured address or opening-hours table, which no requirement needs before Admin's settings screen.
- **D14 — The threshold compares the merchandise subtotal at the price paid, before vouchers.** Vouchers (FR-17) don't exist yet; Sprint 7 may change this and must say so in its spec.
- **D15 — `shippingFee` ignores `pickupEnabled`.** The setting decides whether the checkout offers pickup; the fee for a pickup order is 0 whenever one exists. Refusing a pickup order when it is off belongs to #78.
- **D16 — `getShippingConfig()` belongs here.** The fee function takes plain rows, and mapping the Prisma rows once (and testing it) keeps #77 and #78 from doing it twice. It is not cached: checkout is per request and a stale fee would be wrong money. *Rejected:* waiting for #77 to add it.
- **D17 — The PRD's `Address` row lists place names; the issue and `Order` say addresses carry PSGC codes.** This spec stores both for each level (code from the dataset, name from the dataset) when #77 and #65 add `Address`; it adds no address table. *Flag:* the PRD data model row should say "codes and names" when those stories land.
- **D18 — Region list is the PSA's, in the PSA's order, 18 regions.** NCR, CAR, I, II, III, IV-A, MIMAROPA, V, VI, NIR, VII, VIII, IX, X, XI, XII, XIII, BARMM. The form sorts if it wants.
- **D19 — Independent cities are in the data twice: as a pseudo-province, and as a short entry in their geographic province (review decision, Q5).** The shape is decided now and the labels later (#77). The short entry carries no barangays, so the data isn't duplicated; the barangays are in the city's own file. A hand-made, tested map (`independentCityProvinces`) supplies the geography, because PSGC doesn't. `resolveAddress` accepts both paths (V9, V10). *Rejected:* only PSA's structure (a shopper from Mandaue looks under Cebu); copying the barangays into the province file (Cebu's file would grow by the barangays of three cities, and there would be two copies to keep equal).
- **D20 — The plan's first task proves the data route and the server read on a Vercel preview (review decision).** A preview deploy of the route and a temporary proof route (one `resolveAddress` call) must both work before the rest is built, because file tracing is the one thing local runs can't show. The proof route is deleted before merge. If it fails, the fix is in `outputFileTracingIncludes` (or the story's file layout changes), and the spec is updated first.

### Acceptance criteria → examples and rules

| Acceptance criterion | Covered by |
| --- | --- |
| `ShippingRate` table: zone, nullable `maxWeightGrams`, fee in centavos | §6 Schema, Rules › Tiers, S5, S6 |
| Single-row `StoreSettings` with threshold (nullable), pickup, address, hours, info, order expiry (24); COD later | Behavior 16, §6 Schema, Rules › Store settings, S5, S6 |
| Seed fills rates for the four zones, creates the settings row only when missing, never overwrites; fictional address and hours; demo-values comment; `--reset` and `resetCatalog()` handle the tables | Behavior 17–18, §5 demo store, §6 demo values, D10, S1–S4, S7, S8 |
| PSGC dataset converted by a committed script to JSON with codes (regions → provinces per region → cities and barangays per province), version recorded, versioned URL cached forever, server validates with the same files | Behavior 1–2, 8–9, D1, D12, D20, A1, A10–A12, A17, V1–V6, V9–V11, R1–R7 |
| PSGC quirks: NCR without provinces; highly urbanized cities outside their province; NIR; ZIP stays 4-digit text | Behavior 3–5, 7, D2–D4, D19, A2–A8, A13–A16, V7–V8 |
| (Review) Converter tests: Manila keeps its barangays (count asserted); names trimmed and footnote markers removed | Rules › PSGC facts, C1–C3, C8, A3, A9 |
| Region → zone map; a test fails if a dataset region has no zone | Behavior 10–11, Rules › Region → zone map, Z1–Z6 |
| Pure `shippingFee` in integer centavos: pickup 0; threshold (equal is free); smallest tier; open-ended tier above the bounded ones | Behavior 13–15, F1–F11 |
| Order weight = Σ `weightGrams × quantity` over single lines and build group parts | Behavior 12, W1–W6 |
| Unit tests: pickup, threshold boundary and off, tier boundaries for every zone, open-ended tier, no rates for a zone | Test plan, F1–F17 |

## 10. Open questions

None. The review settled the six earlier questions:

1. Q1, Q2: the demo store details, the rates and the ₱75,000 threshold stay as proposed.
2. Q3: "no rates for the zone" is checked first and refuses delivery (D7).
3. Q4: `data/psgc/2026Q3.xlsx` is committed; the largest generated file is reported (D1, A17).
4. Q5: the data shape is decided now: independent cities are pseudo-provinces and also listed in their geographic province through a tested map; #77 decides the labels (D19).
5. Q6: the demo rates are seeded only when `ShippingRate` is empty (D10).
6. D17 and ADR 0008 are accepted. The review also changed D12 (files outside `public/`, served by a route handler) and added D20 (a preview-deploy proof as the plan's first task).
