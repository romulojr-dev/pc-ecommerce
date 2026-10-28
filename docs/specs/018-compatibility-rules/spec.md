# 018 — Compatibility rules engine: part-to-part rules

Status: **Approved** · Issue: #51 (epic #3) · PRD refs: PC Builder › Flow, Compatibility rules (MVP), Implementation notes; Non-functional requirements › Quality, Performance

## 1. Summary

This story adds `lib/builder/`, a pure TypeScript module that checks a build and returns plain-language errors and warnings. The browser (instant feedback) and the server (checkout re-check) run the same code. It covers the nine part-to-part rules of the PRD table: socket match, memory type, form factor, GPU length, cooler height, cooler socket, radiator fit, PSU form factor and BIOS update. It also defines the build shape: slot → `{ part, quantity }` entries, plus a parser that cleans untrusted builds. The count, capacity and power rules (#52), the builder page (#53) and the slot picker (#54) build on that shape. It has no UI of its own. A shopper sees its output once #53 and #54 ship.

## 2. Behavior

The engine is a set of pure functions. It has no screen, so "the shopper sees" below means what #53 and #54 will show from its output.

1. **Untrusted input is cleaned first.** Every build that comes from outside the running code goes through `parseBuild`: localStorage, a share link, a saved build, or a checkout request. `parseBuild` checks the stored shape (`{ slot, productId, quantity }` items, 1:1 with `BuildItem` rows) against a Zod schema. It drops or repairs what breaks the slot limits and returns the clean items plus a list of what it changed. The caller loads the parts for the remaining ids. `assembleBuild` then attaches the parts, drops ids that weren't found or sit in the wrong slot, and reports those changes too. #53 turns the changes into a notice.
2. **A build goes in.** A `Build` maps each slot to a list of entries `{ part, quantity }`. Each part carries its id, name, category and validated specs. A missing slot and an empty list both mean "nothing picked".
3. **The shape is checked again.** Slot limits: Storage holds several entries (each with quantity ≥ 1, one per product). Memory holds one entry with quantity ≥ 1. Every other slot holds one entry with quantity 1. Each part's category must equal its slot. A build that came through `parseBuild` and `assembleBuild` always passes. If one still breaks a limit, that is a bug in the calling code: the engine throws `InvalidBuildError` and checks no rules.
4. **`checkBuild(build)` runs every rule.** A rule runs only when all of the parts it reads are picked. Otherwise it is silent. Each rule that fails gives one issue `{ rule, severity, parts, message }`.
5. **Issues come back in a fixed order:** errors before warnings, then PRD table order (socket match, memory type, form factor, GPU length, cooler height, cooler socket, radiator fit, PSU form factor, BIOS update). The same build always gives the same list, in the browser and on the server.
6. **`checkCandidate(build, slot, part, options?)`** answers "what would go wrong if I picked this part?" for the slot picker. It puts the candidate into a copy of the build and returns only the issues that involve the candidate. In a single-part slot the candidate **replaces** the current part. In storage it is **added**, or it **replaces** one entry when the picker is changing that drive. The part being replaced is gone from the copy, so its conflicts are never reported against the candidate.
7. **`buildStatus(issues)`** gives `"errors"` if any issue is an error, else `"warnings"` if any is a warning, else `"ok"`. #53 shows these as OK / Warnings / Errors.

**Empty state:** an empty build, or one with no rule whose parts are all picked, gives `[]` and status `"ok"`. `parseBuild` of nothing stored gives an empty build with no changes. The builder page decides how to show an empty build (#53).
**Loading state:** none. The functions are synchronous and need no network. Loading parts is #53's and #54's job.
**Error state:** bad stored data is never an error: `parseBuild` and `assembleBuild` repair it and report changes. Only a malformed build passed straight to `checkBuild` or `checkCandidate` (a programming error) throws `InvalidBuildError` listing every problem.

## 3. Examples

Parts are real seed parts, referred to by name. "Build A/B/C" are spec 001's compatible builds. Results list only this story's nine rules. #52 adds memory slots, memory capacity, PSU wattage, M.2 slots and integrated graphics to the same results.

### Compatible builds (spec 001)

| # | Build | Result |
| --- | --- | --- |
| E1 | A: Ryzen 5 7600, ROG Strix B650-A, Vengeance DDR5, 990 PRO, RTX 4060, LANCOOL 216, MWE 550, Peerless Assassin | `[]`, status ok |
| E2 | B: i5-14400F, PRO B760M-A DDR4, FURY Beast DDR4, MX500, RTX 5070 SFF, Q300L, RM850e, Peerless Assassin | 1 warning: bios-update. Status warnings |
| E3 | C: Ryzen 5 7600, B650I Lightning, Vengeance DDR5, SN850X, RTX 5070 SFF, Ridge, SF750, NH-L9a-AM5 | `[]`, status ok |
| E4 | Empty build | `[]`, status ok |

### Socket match (error)

| # | Input | Expected |
| --- | --- | --- |
| E5 | A with i5-14400F | 1 error: "The Intel Core i5-14400F (LGA1700) doesn't fit the AM5 socket on the ASUS ROG Strix B650-A Gaming WiFi." No bios-update issue. parts: cpu, motherboard |
| E6 | Ryzen 5 5600 (AM4) + MSI MAG B550 Tomahawk (AM4) | none |
| E7 | i5-14400F, no board | none (rule needs both) |

### Memory type (error)

| # | Input | Expected |
| --- | --- | --- |
| E8 | A with FURY Beast DDR4 | "The Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 is DDR4 memory, but the ASUS ROG Strix B650-A Gaming WiFi takes DDR5." |
| E9 | 2 × FURY Beast DDR4 (one entry, quantity 2) on ROG Strix B650-A | One error, same message (not one per kit) |
| E10 | Vengeance DDR5 on ASUS PRIME B760M-A WiFi (DDR5) | none. The same kit on the MSI PRO B760M-A WiFi DDR4 gives an error |

### Form factor (error)

| # | Input | Expected |
| --- | --- | --- |
| E11 | ROG Strix B650-A (ATX) in Fractal Design Ridge | "The ASUS ROG Strix B650-A Gaming WiFi (ATX) doesn't fit the Fractal Design Ridge Black, which takes Mini-ITX boards." |
| E12 | ROG Strix B650-A in Q300L | "… doesn't fit the Cooler Master MasterBox Q300L, which takes Micro-ATX or Mini-ITX boards." |
| E13 | B650I Lightning (Mini-ITX) in LANCOOL 216 | none |
| E14 | Fixture E-ATX board in Corsair 4000D AIRFLOW (ATX/mATX/ITX) | error. The same board in LANCOOL 216 gives none |

### GPU length (error, `≤` fits)

| # | Input | Expected |
| --- | --- | --- |
| E15 | C with ROG Astral RTX 5090 (358 mm) in Ridge (335 mm) | "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB is 358 mm long, but the Fractal Design Ridge Black fits graphics cards up to 335 mm." |
| E16 | ROG Astral RTX 5090 (358) in Q300L (360) | none (tight pass, spec 001) |
| E17 | Sapphire NITRO+ RX 9070 XT (331) in NR200P (330) | error, 1 mm over |
| E18 | Fixture GPU 330 mm in NR200P (330) | none (equal fits) |

### Cooler height (error, air coolers only, `≤` fits)

| # | Input | Expected |
| --- | --- | --- |
| E19 | C with Peerless Assassin (155 mm) in Ridge (70 mm) | "The Thermalright Peerless Assassin 120 SE is 155 mm tall, but the Fractal Design Ridge Black fits CPU coolers up to 70 mm." |
| E20 | ID-COOLING SE-224-XT (153) in NR200P (153) | none (equal fits) |
| E21 | DeepCool AK620 (157) in Q300L (157) | none (equal fits) |
| E22 | Peerless Assassin (155) in NR200P (153) | error |
| E23 | Liquid Freezer III 360 (AIO) in Ridge | no cooler-height issue (radiator fit applies instead, E30) |

### Cooler socket (error)

| # | Input | Expected |
| --- | --- | --- |
| E24 | B with NH-L9a-AM5 | "The Noctua NH-L9a-AM5 Low-Profile Cooler doesn't support the LGA1700 socket of the Intel Core i5-14400F. It supports AM5." parts: cpu-cooler, cpu |
| E25 | New Intel-only cooler (Noctua NH-L9i-17xx, see Rules › Seed) + Ryzen 5 7600 | error: "… doesn't support the AM5 socket of the AMD Ryzen 5 7600. It supports LGA1700 and LGA1851." |
| E26 | NH-L9i-17xx + i5-14400F | none |
| E27 | NH-L9a-AM5 + PRO B760M-A DDR4, **no CPU** | error naming the board: "… doesn't support the LGA1700 socket of the MSI PRO B760M-A WiFi DDR4. It supports AM5." parts: cpu-cooler, motherboard |
| E28 | i5-14400F + ROG Strix B650-A + NH-L9a-AM5 | socket-match error, plus a cooler-socket error naming the **CPU** (LGA1700). The CPU wins over the board |
| E29 | NH-L9a-AM5 alone, or with only a case | none |

### Radiator fit (warning, AIO only)

| # | Input | Expected |
| --- | --- | --- |
| E30 | C with Liquid Freezer III 360 in Ridge (120/280) | Warning: "The Fractal Design Ridge Black lists 120 or 280 mm radiators, not the 360 mm radiator of the Arctic Liquid Freezer III 360. It may not fit." |
| E31 | Liquid Freezer III 280 in Ridge | none |
| E32 | NZXT Kraken 240 in Q300L (120/140/240) | none. Liquid Freezer III 360 in Q300L gives a warning |
| E33 | Fixture case with `radiatorSizesMm: []` + Kraken 240 | Warning: "The {case} doesn't list any radiator mounts, so the 240 mm radiator of the NZXT Kraken 240 may not fit." |
| E34 | Same fixture case + Peerless Assassin (air) | none |

### PSU form factor (error)

| # | Input | Expected |
| --- | --- | --- |
| E35 | C with Corsair RM850e (ATX) in Ridge | "The Corsair RM850e (2023) 850W (ATX) doesn't fit the Fractal Design Ridge Black, which takes SFX or SFX-L power supplies." |
| E36 | Corsair SF850L (SFX-L) in Ridge | none |
| E37 | Corsair SF750 (SFX) in LANCOOL 216 (ATX only) | error (the data lists ATX only). SF750 in Lian Li A3-mATX (ATX/SFX/SFX-L) gives none |

### BIOS update (warning)

| # | Input | Expected |
| --- | --- | --- |
| E38 | A with Ryzen 7 9800X3D (zen-5) on ROG Strix B650-A (native zen-4) | Warning: "The ASUS ROG Strix B650-A Gaming WiFi may need a BIOS update to run the AMD Ryzen 7 9800X3D: its launch BIOS supports Zen 4 (Ryzen 7000), not Zen 5 (Ryzen 9000)." |
| E39 | Ryzen 7 9800X3D on Gigabyte X870E AORUS ELITE (native zen-4, zen-5) | none |
| E40 | i5-14400F on PRO B760M-A DDR4 (native alder-lake, raptor-lake) | Warning: "… its launch BIOS supports Alder Lake (12th gen) and Raptor Lake (13th gen), not Raptor Lake Refresh (14th gen)." |
| E41 | i5-13400F (raptor-lake) on PRO B760M-A DDR4 | none. On ASRock H610M-HDV/M.2 R2.0 (native alder-lake only) it gives a warning |
| E42 | i5-14400F on ROG Strix B650-A | socket-match error only, no BIOS warning |

### Several issues, ordering and status

| # | Input | Expected |
| --- | --- | --- |
| E43 | C with RM850e **and** Liquid Freezer III 360 | `[psu-form-factor error, radiator-fit warning]` (errors first). Status errors |
| E44 | A with i5-14400F and FURY Beast DDR4 | `[socket-match, memory-type]` (PRD order) |
| E45 | `buildStatus([])` / only warnings / one error among warnings | ok / warnings / errors |

### `checkCandidate`: adding to an empty or filled slot

| # | Build | Call | Expected |
| --- | --- | --- | --- |
| E46 | Ryzen 5 7600 only | `checkCandidate(b, "motherboard", PRO B760M-A DDR4)` | 1 socket-match error |
| E47 | Ryzen 5 7600 only | candidate ROG Strix B650-A | `[]` |
| E48 | Ryzen 5 7600 + PRO B760M-A DDR4 (already a socket error) | `checkCandidate(b, "case", LANCOOL 216)` | `[]`. The existing CPU–board error doesn't involve the case |
| E49 | Build A with 2 × Vengeance DDR5 | candidate memory FURY Beast DDR4 | memory-type error. The candidate replaces the kit and keeps the slot's quantity (2) |
| E50 | Build A (990 PRO in storage) | `checkCandidate(b, "storage", SN850X)` | `[]`. With no `replace`, the SN850X is added as a second entry and the 990 PRO stays |
| E51 | Any build | `checkCandidate(b, "gpu", Ryzen 5 7600)` | throws `InvalidBuildError` (part's category is not the slot) |

### `checkCandidate`: replacing a part (never a conflict with the replaced part)

| # | Build | Call | Expected |
| --- | --- | --- | --- |
| E52 | i5-14400F + ROG Strix B650-A (socket error today) | `checkCandidate(b, "cpu", Ryzen 5 7600)` | `[]`. The i5-14400F is replaced, so its socket error is not reported |
| E53 | Ryzen 5 7600 + ROG Strix B650-A | `checkCandidate(b, "cpu", Ryzen 7 9800X3D)` | Only the bios-update warning for the 9800X3D. Nothing names the 7600 |
| E54 | Build C (Ridge) | candidate cooler Peerless Assassin | 1 cooler-height error for the Peerless. The NH-L9a-AM5 it replaces is not in the result |
| E55 | Build C with storage [990 PRO, SN850X] on the B650I (2 M.2 slots) | `applyCandidate(b, "storage", Kingston NV3, { replace: SN850X })` | storage [990 PRO, NV3]: still 2 drives, NV3 in the SN850X's position. With #52's M.2 rule, `checkCandidate` gives no M.2 warning. Without `replace` it gives 3 M.2 drives and the warning |
| E56 | storage [990 PRO ×2] | `applyCandidate(…, Kingston NV3, { replace: 990 PRO })` | storage [NV3 ×2]: the replacement keeps the entry's quantity |
| E57 | storage [990 PRO, SN850X] | `applyCandidate(…, 990 PRO, { replace: SN850X })` | storage [990 PRO ×2]: replacing with a drive already listed merges into that entry |
| E58 | storage [990 PRO] | `applyCandidate(…, NV3, { replace: SN850X })` | throws `InvalidBuildError`: SN850X is not in storage |
| E59 | Build A | `checkCandidate(b, "cpu", Ryzen 5 7600)` (the CPU already picked) | `[]`, the part's current issues |

### Shape validation (`checkBuild` on a malformed build)

| # | Input | Expected |
| --- | --- | --- |
| E60 | cpu: two entries | throws: cpu holds one entry |
| E61 | gpu: one entry, quantity 2 | throws: gpu quantity must be 1 |
| E62 | memory: quantity 0, or 1.5 | throws: quantity must be a whole number ≥ 1 |
| E63 | memory: two different kits | throws: memory holds one entry |
| E64 | storage: 990 PRO ×2 and SN850X ×1 | valid |
| E65 | storage: 990 PRO twice as separate entries | throws: one entry per product (use quantity) |
| E66 | case slot holding a PSU | throws: part category psu doesn't match slot case |
| E67 | storage: `[]` | valid, same as no storage |
| E68 | Several problems at once | throws once, listing every problem |

### `parseBuild` and `assembleBuild` (untrusted input)

Items are `{ slot, productId, quantity }`. Ids below are seed SKUs standing in for product ids.

| # | Input | Clean result | Changes reported |
| --- | --- | --- | --- |
| E69 | `[{ slot: "fans", productId: "x", quantity: 1 }, Ryzen 5 7600 ×1 in cpu]` | cpu: Ryzen 5 7600 | dropped `fans` entry: unknown slot |
| E70 | memory: Vengeance DDR5, quantity 0, -1 or 1.5 | no memory | dropped: invalid quantity |
| E71 | cpu: Ryzen 5 7600, then cpu: i5-14400F | cpu: Ryzen 5 7600 (the first) | dropped i5-14400F: cpu holds one part |
| E72 | memory: Vengeance DDR5 ×2, then memory: FURY Beast DDR4 ×1 | memory: Vengeance DDR5 ×2 | dropped FURY Beast: memory holds one kit |
| E73 | storage: 990 PRO ×1, SN850X ×1, 990 PRO ×2 | storage: 990 PRO ×3, SN850X ×1 (first position kept) | merged the duplicate 990 PRO entries |
| E74 | gpu: RTX 4060, quantity 2 | gpu: RTX 4060 ×1 | repaired: gpu quantity set to 1 |
| E75 | memory: quantity `"2"` (a string), a missing or empty `productId`, or an item that isn't an object | entry dropped | dropped: invalid entry (no coercion, as in the seed) |
| E76 | `"oops"`, `null`, or an object instead of a list | empty build | reset: not a list of items |
| E77 | `undefined` (nothing stored) | empty build | none |
| E78 | Build A as items | the same items, in slot order | none. Parsing the output again gives the same result |
| E79 | `assembleBuild`: gpu id not among the loaded parts (deleted or no longer active) | no gpu | dropped: part not found |
| E80 | `assembleBuild`: storage item whose id loads as the Ryzen 5 7600 | no storage | dropped: a cpu part in the storage slot |
| E81 | Every input in E69–E80, after `parseBuild` then `assembleBuild` | `checkBuild` never throws | — |

### Spec data coverage and seed (first task)

| # | Input | Expected |
| --- | --- | --- |
| E82 | Today's schemas | Coverage tests pass |
| E83 | `case.maxGpuLengthMm` made `.optional()` | Test fails, naming case.maxGpuLengthMm and gpu-length |
| E84 | AIR cooler's `heightMm` (required on the AIR branch, `z.never` on AIO) | Counts as required. No failure |
| E85 | `"cooler-socket"` tag removed from `cpu.socket` | Test fails: cooler-socket has no field in cpu |
| E86 | Seed after this story | 151 parts. At least one cooler without AM4/AM5 and one without LGA1700/LGA1851. Every spec 011 coverage test passes |
| E87 | `lib/specs/**` or `lib/builder/**` importing `@/lib/db`, `@/generated/prisma` (enums included), `server-only`, `next/*` or `react` | `pnpm lint` fails. Today's `lib/specs` imports only `zod` and its own files (checked while writing this spec), so it passes without changes |

## 4. Rules and edge cases

### Input shape

- `Build` maps each slot to an entry list. Slots are the eight builder category slugs (`builderCategories`). Every entry maps 1:1 to a `BuildItem` row (`slot` = the key, `productId` = `part.id`, `quantity`).
- Limits (the same in `parseBuild`, `validateBuild` and the Zod schema):

  | Slot | Entries | Quantity |
  | --- | --- | --- |
  | storage | 0 or more, one per product | whole number ≥ 1 |
  | memory | 0 or 1 | whole number ≥ 1 |
  | cpu, motherboard, gpu, case, psu, cpu-cooler | 0 or 1 | exactly 1 |

- `part.category` must equal the slot.
- No upper limit on memory or storage quantity. Too many sticks or drives are #52's memory-slots and M.2-slots rules, not shape errors. The cart checks stock.
- **Specs are trusted.** Parts reach the engine only after `validateSpecs` (every DB write is validated, ADR 0001), and the types require the category's `Specs<C>`. The engine does not re-validate.
- `validateBuild(build)` returns every shape problem. It is empty for a valid build. `checkBuild` and `checkCandidate` call it and throw `InvalidBuildError` (carrying the list) when it is non-empty. That only happens when code builds a `Build` without `parseBuild`/`assembleBuild`, i.e. a bug.

### Parsing untrusted builds

- **Entry points:** every build read from localStorage (#53), a share link or saved build (FR-19), or a checkout request goes through `parseBuild` and then `assembleBuild` before any other builder function sees it. Builds made in memory by the store's own actions don't need it.
- **Two steps, because ids come before parts.** `parseBuild(input: unknown)` works on ids alone, so the caller knows which parts to load. `assembleBuild(items, parts)` runs after loading, when categories are known.
- **`buildItemsSchema`** (Zod) describes one stored item: `slot` is one of the eight slugs; `productId` is a non-empty string; `quantity` is an integer ≥ 1. There is no coercion: `"2"` is not 2.
- **Repairs**, applied in this order, each reported once:
  1. Input that isn't a list → empty build, one `reset` change. `undefined` → empty build, no change.
  2. An item that fails the schema → dropped (`invalid-entry`, or `unknown-slot` / `invalid-quantity` when that is the only problem).
  3. Storage: entries with the same `productId` → merged into the first one, quantities summed (`merged-duplicate`).
  4. Single-entry slots (memory and the six one-part slots): the first entry is kept, later ones are dropped (`extra-entry`). The first is kept because the store replaces in place, so a second entry can only come from corrupted or hand-made data.
  5. One-part slots with quantity > 1 → set to 1 (`quantity-set-to-1`). Memory keeps its quantity.
- **`assembleBuild`** drops items whose id is not in the loaded parts (`not-found`: deleted, draft, or never existed) and items whose part's category differs from the slot (`wrong-category`). The caller loads only active products, so an inactive part counts as not found. #53's "dropped with a notice" uses these changes.
- **Output** is in slot order (`builderCategories`). Storage keeps input order. Parsing is idempotent: parsing a clean result changes nothing.
- **Changes** carry `{ kind, slot?, productId?, detail }`. They are data for the UI and logs. #53 owns the shopper-facing notice copy.
- After both steps, `checkBuild` never throws (E81).

### Running rules

- A rule runs only when every part it reads is picked. The one exception is cooler socket (below).
- At most one issue per rule per build: every part this story's rules read sits in a one-entry slot. Memory quantity doesn't change memory type (E9).
- Comparisons are on stored integers. Boundaries fit: `≤` for GPU length and cooler height (spec 001's rounding already leans toward caution).
- `parts` lists the involved parts as `{ slot, id }`, in the order of the PRD's "Parts checked" column (e.g. cpu then motherboard). The UI uses it to mark the parts, and can build a shorter label from these parts later without changing the engine (see D1).

| Rule | Runs when | Fails when | Severity |
| --- | --- | --- | --- |
| socket-match | cpu, motherboard | `cpu.socket ≠ motherboard.socket` | error |
| memory-type | memory, motherboard | `memory.memoryType ≠ motherboard.memoryType` | error |
| form-factor | motherboard, case | `motherboard.formFactor ∉ case.motherboardFormFactors` | error |
| gpu-length | gpu, case | `gpu.lengthMm > case.maxGpuLengthMm` | error |
| cooler-height | AIR cooler, case | `cooler.heightMm > case.maxCoolerHeightMm` | error |
| cooler-socket | cooler, and cpu **or** motherboard | the socket (CPU's if picked, else the board's) `∉ cooler.supportedSockets` | error |
| radiator-fit | AIO cooler, case | `cooler.radiatorSizeMm ∉ case.radiatorSizesMm` (an empty list always fails) | warning |
| psu-form-factor | psu, case | `psu.formFactor ∉ case.psuFormFactors` | error |
| bios-update | cpu, motherboard | sockets are equal **and** `cpu.generation ∉ motherboard.nativeCpuGenerations` | warning |

- **Cooler socket with CPU and board on different sockets:** the CPU's socket is used (E28). Socket match already reports the CPU–board conflict. Checking the cooler against the CPU tells the shopper whether the cooler is right for the processor they chose.
- **BIOS update** stays silent when the sockets differ (socket match reports it). Its data is `motherboard.nativeCpuGenerations` matched against `cpu.generation`, with no new field (spec 001 R4). It is a warning, so it never blocks the build. A shop whose stock ships with a newer BIOS adds the generation to the board's list, and the warning goes away (spec 001).
- **AIR vs AIO:** cooler height applies to AIR only, radiator fit to AIO only (the cooler schema's discriminated union).
- **Radiator fit is a warning** (PRD). `case.radiatorSizesMm` is "every size that fits in any mounting position", so a listed size may still clash with other parts. An empty list means the case takes no AIO; it is a separate message, still a warning.
- **PSU form factor is data-driven.** An SFX unit in a case that lists only ATX is an error (E37), even though many ATX cases take SFX with a bracket. A case that does should list SFX in its data.
- **Memory capacity** (#52) and an **empty `case.radiatorSizesMm`** can't be reached with the seed. Unit-test fixtures cover them.
- **Pure and deterministic:** no I/O, no clock, no randomness, no shared state. Inputs are never mutated (`checkCandidate` works on a copy), so concurrent calls from the picker are safe. Output order is fixed (Behavior step 5).
- **Product names** appear in messages exactly as stored (`Product.name`).

### `checkCandidate` and `applyCandidate`

- `applyCandidate(build, slot, part, options?)` returns the changed copy of the build. `checkCandidate` takes the same arguments and returns the issues from `checkBuild(applyCandidate(…))` whose `parts` include the candidate (matched by slot and id).
- **Single-part slots** (cpu, motherboard, gpu, case, psu, cpu-cooler) and **memory**: the candidate **replaces** the current part. The replaced part is not in the copy, so no issue between it and the candidate (or anything else) can be reported. Memory keeps the slot's current quantity (default 1); the others use quantity 1. `replace` is not used for these slots.
- **Storage, adding:** with no `replace`, the candidate is added with quantity 1 at the end. If the same drive is already listed, that entry's quantity goes up by 1 instead (one entry per product).
- **Storage, changing a drive:** with `{ replace: productId }`, the candidate takes that entry's place and keeps its position and quantity. Nothing is added, so the drive count stays the same and the replaced drive's conflicts disappear (E55). If the candidate is already listed elsewhere in storage, the two entries merge into the existing one, quantities summed (E57). A `replace` id that isn't in storage throws `InvalidBuildError` (a picker bug, E58).
- A candidate that is already the slot's part gives that part's current issues (E59).

### Purity

- `lib/builder/**` and `lib/specs/**` import only `zod`, each other (`lib/builder` → `lib/specs`, never the other way) and plain TypeScript. No `@/lib/db`, `@/generated/prisma` (its enums included), `server-only`, `next/*` or `react`. An ESLint `no-restricted-imports` block scoped to both folders enforces this in `pnpm lint`. Test files there may also import `vitest`.
- Checked while writing this spec: every file in `lib/specs` imports only `zod`, `vitest` (tests) and its own modules. Nothing imports the Prisma client or server-only code, so extending the rule needs no fix.

### Spec data coverage (first task)

- Every field whose `FieldMeta.rules` is non-empty must be required in its schema. For the cooler union, each branch is checked on its own. A field required on its own branch (AIR `heightMm`, AIO `radiatorSizeMm`) passes; `z.never` placeholders are skipped. An `.optional()` (or `.nullable()`/default) rule field fails.
- Every `RuleId` must be tagged on at least one field in each category the PRD table lists for it. The test holds this table, copied from the PRD:

  | Rule | Categories |
  | --- | --- |
  | socket-match | cpu, motherboard |
  | memory-type, memory-slots, memory-capacity | memory, motherboard |
  | form-factor | motherboard, case |
  | gpu-length | gpu, case |
  | cooler-height, radiator-fit | cpu-cooler, case |
  | cooler-socket | cpu-cooler, cpu |
  | psu-wattage | cpu, gpu, psu ("All ↔ PSU": the categories with a power field) |
  | psu-form-factor | psu, case |
  | m2-slots | storage, motherboard |
  | integrated-graphics | cpu ("CPU, no GPU": the GPU counts only by being picked, so it has no tagged field) |
  | bios-update | cpu, motherboard |

- Extra tags are allowed. This story adds `cooler-socket` to `motherboard.socket`, since the rule now reads it when no CPU is picked.

### Seed

- Add one real, in-production cooler that supports **only Intel** sockets, so cooler socket fails on both socket families (today only NH-L9a-AM5 fails, and only on Intel). Proposed: **Noctua NH-L9i-17xx** (AIR, 37 mm, LGA1700 and LGA1851 as listed on `noctua.at`'s spec page, mid tier like the NH-L9a-AM5, 72-month warranty, box contents listed). If the page lists only LGA1700, store that. The part is still Intel-only.
- Noctua is already a cooler brand, so the category keeps its 6 brands (spec 011). Noctua's share goes to 4 of 13 (31%, under the 40% cap). The catalog goes to 151 parts (range 145–155).
- The 150 existing parts are unchanged, so spec 001's builds and pairs and spec 011's scenarios keep their results.
- The coverage test gains one check: some cooler supports no AMD socket, and some cooler supports no Intel socket.

### PRD wording

The PRD's PC Builder intro says "pick one part per slot". It changes to the slot limits above. Replacement text:

> The builder lets a shopper fill each slot (one part per slot, except Memory, which takes one kit in any quantity, and Storage, which takes several drives), checks every pair of parts as they go, and never lets an incompatible build reach checkout without a clear warning.

Flow step 2 gains: "Storage holds several drives; Memory holds one kit with a quantity; every other slot holds one part."

## 5. Messages and copy

All shopper-facing text is English. `{…}` are placeholders. Names are `Product.name`. Values use the field's display labels and units, formatted like the spec table (`formatSpecValue`: `SOCKET_LABELS`, `MOTHERBOARD_FORM_FACTOR_LABELS`, `PSU_FORM_FACTOR_LABELS`, `CPU_GENERATION_LABELS`, `MEMORY_TYPE_LABELS`, "358 mm"). Lists follow enum order. "Takes" lists join with "or" ("Micro-ATX or Mini-ITX"). "Supports" lists join with "and" ("LGA1700 and LGA1851"). Three or more items get commas: "A, B or C". Messages avoid possessives ("the socket on the {board}"), since names are long and some end in "s" or ")".

| Rule | Message |
| --- | --- |
| socket-match | The {cpu} ({cpuSocket}) doesn't fit the {boardSocket} socket on the {board}. |
| memory-type | The {memory} is {memoryType} memory, but the {board} takes {boardMemoryType}. |
| form-factor | The {board} ({formFactor}) doesn't fit the {case}, which takes {caseFormFactors} boards. |
| gpu-length | The {gpu} is {lengthMm} long, but the {case} fits graphics cards up to {maxGpuLengthMm}. |
| cooler-height | The {cooler} is {heightMm} tall, but the {case} fits CPU coolers up to {maxCoolerHeightMm}. |
| cooler-socket | The {cooler} doesn't support the {socket} socket of the {cpu or board}. It supports {supportedSockets}. |
| radiator-fit | The {case} lists {radiatorSizesMm} radiators, not the {radiatorSizeMm} radiator of the {cooler}. It may not fit. |
| radiator-fit (case lists none) | The {case} doesn't list any radiator mounts, so the {radiatorSizeMm} radiator of the {cooler} may not fit. |
| psu-form-factor | The {psu} ({psuFormFactor}) doesn't fit the {case}, which takes {casePsuFormFactors} power supplies. |
| bios-update | The {board} may need a BIOS update to run the {cpu}: its launch BIOS supports {nativeGenerations}, not {cpuGeneration}. |

Status values: `ok`, `warnings`, `errors`. #53 owns their display labels (OK / Warnings / Errors).

Developer-facing text (logs and tests, not shoppers):

`InvalidBuildError`: `Invalid build: {n} problem(s)`, then one line each:

- `{slot}: holds one entry, got {n}`
- `{slot}: quantity must be 1, got {q}`
- `{slot}: quantity must be a whole number of at least 1, got {q}`
- `storage: {productId} is listed more than once; use quantity`
- `{slot}: part {productId} is a {category}, not a {slot}`
- `storage: cannot replace {productId}, it is not in the build`

`BuildChange.detail`, one per change kind:

| Kind | Detail |
| --- | --- |
| `reset` | stored build is not a list of items |
| `invalid-entry` | item {index} is not a valid build item |
| `unknown-slot` | {slot} is not a builder slot |
| `invalid-quantity` | {slot} {productId}: quantity {q} is not a whole number of at least 1 |
| `merged-duplicate` | storage {productId}: merged {n} entries |
| `extra-entry` | {slot} holds one part; dropped {productId} |
| `quantity-set-to-1` | {slot} {productId}: quantity {q} set to 1 |
| `not-found` | {slot} {productId}: part not found |
| `wrong-category` | {slot} {productId}: part is a {category} |

## 6. Data and interfaces

No database, route or Prisma schema change. A new folder `lib/builder/` exports:

| Name | What it is |
| --- | --- |
| `Slot` | `BuilderCategorySlug` (the eight builder categories, in `builderCategories` order) |
| `BuildPart<S>` | `{ id: string; name: string; category: S; specs: Specs<S> }`. `id` is `Product.id` (a cuid) |
| `BuildEntry<S>` | `{ part: BuildPart<S>; quantity: number }` |
| `Build` | `{ [S in Slot]?: BuildEntry<S>[] }` |
| `BuildItem` | `{ slot: Slot; productId: string; quantity: number }`: the stored and transferred shape, 1:1 with `BuildItem` rows |
| `buildItemsSchema` | Zod schema for one stored item (Rules › Parsing) |
| `SLOT_LIMITS` | Per slot: `{ multipleEntries: boolean; quantity: "one" \| "any" }` (the table in Rules) |
| `parseBuild(input: unknown): { items: BuildItem[]; changes: BuildChange[] }` | Cleans untrusted items |
| `assembleBuild(items, parts: ReadonlyMap<string, BuildPart>): { build: Build; changes: BuildChange[] }` | Attaches loaded parts; drops missing or misplaced ones |
| `toBuildItems(build): BuildItem[]` | The reverse, for saving and sending |
| `BuildChange` | `{ kind; slot?; productId?; detail: string }` (kinds in Messages) |
| `Severity` | `"error" \| "warning"` |
| `Issue` | `{ rule: RuleId; severity: Severity; parts: { slot: Slot; id: string }[]; message: string }` |
| `BuildStatus` | `"ok" \| "warnings" \| "errors"` |
| `validateBuild(build): BuildProblem[]` | Shape problems, empty when valid |
| `InvalidBuildError` | `Error` with `problems: BuildProblem[]` |
| `checkBuild(build): Issue[]` | All issues, in the fixed order |
| `applyCandidate(build, slot, part, options?: { replace?: string }): Build` | The build with the candidate in place (Rules › checkCandidate) |
| `checkCandidate(build, slot, part, options?): Issue[]` | Issues the candidate would cause |
| `buildStatus(issues): BuildStatus` | Worst severity |

- `RuleId` stays in `lib/specs` (field metadata uses it). The engine re-exports it.
- Each rule is one entry in an internal list: id, severity, the check, and the message builder. #52 adds its five rules to the same list without changing these signatures.
- `lib/specs`: `motherboard.socket` gains the `cooler-socket` tag. A new coverage test (Rules › Spec data coverage).
- ESLint: the purity block for `lib/builder/**` and `lib/specs/**`.
- Seed: one cooler in `prisma/seed/data/cpu-coolers.ts`, and one check in `coverage.test.ts`.
- Docs: `CLAUDE.md` gets a line on `lib/builder` (pure, shared by browser and server, input shape and slot limits, `parseBuild` for every untrusted entry point, `checkBuild`/`checkCandidate`/`buildStatus`) and on the purity lint rule. `docs/prd.md` gets the wording in Rules › PRD wording. No new ADR (#54 writes ADR 0006).

## 7. Test plan

The PRD's testing strategy asks for builder rules **test-first** in Vitest. Everything here is a unit test: no database, no env vars, so it runs in `pnpm test` and CI.

| Level | File | Covers |
| --- | --- | --- |
| Unit, written first | `lib/builder/rules/*.test.ts` (one per rule) | Pass, fail and edge cases: E5–E42. Boundaries E16–E18, E20–E21. Fixtures E14, E18, E33–E34 |
| Unit | `lib/builder/check.test.ts` | Spec 001 builds A/B/C (E1–E3), empty build (E4), ordering and multiple issues (E43–E44), `buildStatus` (E45), purity (input not mutated, same output twice) |
| Unit | `lib/builder/candidate.test.ts` | E46–E59, including the replace cases |
| Unit | `lib/builder/build.test.ts` | Shape limits E60–E68 |
| Unit | `lib/builder/parse.test.ts` | `parseBuild` and `assembleBuild`: E69–E81, idempotence, `toBuildItems` round trip |
| Unit, first task | `lib/specs/rules-coverage.test.ts` | Required rule fields and the RuleId × category table (E82–E85). E83 and E85 run against a doctored copy of the metadata/schema, so the test proves it can fail |
| Unit | `prisma/seed/data/coverage.test.ts` | E86: both socket families have a failing cooler. The existing spec 011 checks still pass |
| Lint | `eslint.config.mjs` | Restricted imports for `lib/builder/**` and `lib/specs/**` (E87) |
| Benchmark, not in CI | `lib/builder/check.bench.ts` | `checkBuild` on a full build and about 26 `checkCandidate` calls, run with `pnpm exec vitest bench`. No wall-clock assertion in CI. #54 tests the 100 ms budget |

- Seed-based examples load the real parts from `prisma/seed/data/` by SKU, with the SKU as `id`. That way a data change that alters a scenario breaks a test. Spec 001's incompatible pairs are fixtures this way. Hand-written fixture parts are used only where the seed can't reach (E-ATX board, an exactly-fitting GPU, an empty radiator list), and are named as fixtures in the test.
- E55's M.2 part is asserted on `applyCandidate`'s result here. #52 adds the `checkCandidate` assertion when the M.2 rule exists.
- No integration tests (no database). No E2E: there is no UI yet. #54 owns the epic E2E (pick CPU → board slot hides other sockets → "Show all" shows the reason → status OK).

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Memory slots, memory capacity, PSU wattage, M.2 slots, integrated graphics, `estimateWattage` | #52 |
| Builder state (Zustand, localStorage), /builder page, summary, status labels, notice copy for parse changes, "Add to build" | #53 |
| Slot picker, "Show all", greyed reasons, the 100 ms performance test, ADR 0006 | #54 |
| Server re-check at checkout (calls `parseBuild` → load → `assembleBuild` → `checkBuild`), and blocking "Add build to cart" on errors / acknowledging warnings | Checkout epic (cart and build-to-cart story) |
| `Build` / `BuildItem` tables, saved and shared builds | Saved builds story (FR-19, PRD Flow step 5) |
| "Ask us" link on warnings (PRD Risks) | #53 or a later builder story |
| Short product names or labels in messages | Not planned. The UI can derive them from `parts` (D1) |
| GPU power connectors, GPU clearance reduced by a front radiator, per-position radiator mounts, specific BIOS versions, SFX-with-bracket support | Not in the MVP (spec 001 Out of scope) |
| Fans, OS, peripherals in the builder | Phase 2 |
| Other languages | Not planned |

## 9. Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | Messages use the full `Product.name`; no `shortName` for now | It is the only name the data has, and it is unambiguous. Each issue's `parts` carries slot and id, so the UI can format a shorter label later without changing the engine | A new `shortName` field (schema, seed and admin change for copy only). Differs from the issue's example ("the PRO B760M-A's"); approved in review |
| D2 | No possessives; "the socket on the {board}" | Names are long, and some end in "s" or ")" | `{name}'s`, as in the issue example |
| D3 | Cooler socket uses the CPU's socket when both CPU and board are picked | The CPU decides the cooler mount; socket match reports the conflict | Checking against both (two errors saying nearly the same thing) |
| D4 | Tag `motherboard.socket` with `cooler-socket` | `FieldMeta.rules` means "rules that read this field", and the board fallback reads it | Leaving the tag off because the PRD lists only Cooler ↔ CPU |
| D5 | Untrusted builds are repaired by `parseBuild`/`assembleBuild`; `checkBuild` throws `InvalidBuildError` only on bugs | Bad stored data is normal (old localStorage, deleted products, edited links) and must not crash the page or checkout; a malformed in-memory build is a bug that should fail loudly | Returning shape problems as `Issue`s (mixes programmer errors into shopper messages and needs RuleIds outside the PRD table), or throwing on bad stored data |
| D6 | Parsing is two steps: ids first, then parts | The caller needs clean ids to know what to load; categories are known only after loading | One `parseBuild(input, parts)`, which would need the parts before the ids were validated |
| D7 | Repairs keep the first entry in a single-entry slot and merge storage duplicates | Deterministic, keeps as much of the shopper's build as possible | Keeping the last entry, or rejecting the whole build |
| D8 | No coercion in `buildItemsSchema` (`"2"` is dropped) | Same rule as the seed and spec schemas; our own code never writes strings | Coercing numeric strings |
| D9 | The engine trusts validated specs | Every write goes through `validateSpecs`; re-parsing on each of ~26 picker calls costs time for nothing | Re-validating specs inside `checkBuild` |
| D10 | Issue order: errors, then PRD table order | Stable tests, and the UI shows blockers first | Insertion order, or PRD order only |
| D11 | `checkCandidate` returns only issues that involve the candidate, on a copy where the replaced part is gone | Existing conflicts between other parts, or with the part being swapped out, would otherwise show on every candidate | Returning the full changed build's issues |
| D12 | Memory candidate keeps the slot's quantity. A storage candidate is appended, or replaces one entry (keeping its position and quantity) when `replace` is given | Matches "change this kit", "add another drive" and "change this drive" in #53; keeps #52's counts honest | Always quantity 1; storage changes as remove-then-add (moves the drive to the end) |
| D13 | One entry per product in storage | Keeps entries 1:1 with `BuildItem` rows without duplicate (slot, productId) pairs | Allowing duplicates and summing |
| D14 | PRD "All ↔ PSU" is tested as cpu, gpu, psu; "CPU, no GPU" as cpu only | Only those categories have fields these rules read; tagging others would be meaningless | Requiring a tag in every category |
| D15 | Rule tests use real seed parts by SKU | Spec 001 says the seed fixtures exist to trigger every rule; drift shows up in tests | Copying values into test-only fixtures |
| D16 | Intel-only cooler: Noctua NH-L9i-17xx | The Intel twin of the NH-L9a-AM5 already in the seed; same brand keeps spec 011's brand rules | A new brand (would be a 7th cooler brand, against spec 011) |
| D17 | Performance by `vitest bench`, outside CI | The AC rules out tight timing in CI; #54 owns the real budget | A loose `expect(ms).toBeLessThan(…)` in unit tests |
| D18 | Purity enforced by one ESLint rule over `lib/builder/**` and `lib/specs/**` | Catches a stray `@/lib/db` or Prisma enum import at lint time, before it breaks the browser bundle; `lib/specs` already follows it, so no fix is needed | Relying on review; covering `lib/builder` only |
| D19 | The spec changes the PRD's "one part per slot" | The issue's AC asks for it. `docs/prd.md` gets the replacement wording (Rules › PRD wording) in this story's PR. The online PRD doc is updated to match after merge | Keeping the PRD and treating Memory quantity as a special case |

## 10. Open questions

None. Both questions from the draft were settled in review: full product names (D1) and the purity rule extended to `lib/specs/**` (D18).

## Acceptance criteria mapping

| Acceptance criterion (#51) | Covered by |
| --- | --- |
| Spec data coverage: optional rule field fails; every RuleId tagged in each PRD category | Rules › Spec data coverage; E82–E85 |
| Seed: an Intel-only cooler; spec 001/011 scenarios keep results; coverage tests pass | Rules › Seed; E25–E26, E86, E1–E3 |
| Spec 018 records BIOS data, memory capacity and empty radiator list as fixtures | Rules › Running rules (BIOS update, fixture-only bullet); E33, E38–E42 |
| `lib/builder/` is pure TypeScript | Rules › Purity; D18; E87 |
| One input shape, slot limits, over-limit rejected | Rules › Input shape and Parsing; E60–E81 |
| `checkBuild` returns `{ rule, severity, parts, message }[]` | Behavior 4–5; Data and interfaces; E1–E45 |
| Test-first rules, pass/fail/edge for the nine rules; spec 001 pairs as fixtures | Examples E5–E42; Test plan; D15 |
| Rule runs only when its parts are picked; cooler socket board fallback; BIOS silent on socket mismatch | Rules › Running rules; E7, E27–E29, E42 |
| `checkCandidate` and `buildStatus` | Behavior 6–7; Rules › checkCandidate; E45–E59 |
| Messages name both parts and values; spec lists every message | Messages and copy; examples E5–E40 |
| PRD Flow states slot limits | Rules › PRD wording; D19 |
| No tight wall-clock assertion in CI | Test plan (bench); D17 |
