# 019 — Count, capacity and power rules with a wattage estimate

Status: **Approved** · Issue: #52 (epic #3, depends on #51) · PRD refs: PC Builder › Flow (step 4), Compatibility rules (memory slots, memory capacity, PSU wattage, M.2 slots, integrated graphics)

## 1. Summary

This story adds the last five rows of the PRD rules table to the engine from spec 018: memory slots, memory capacity, PSU wattage, M.2 slots and integrated graphics. It adds `estimateWattage(build)`, the power figure the builder summary (#53) shows next to the PSU's capacity, before and after a PSU is picked. It also redefines `checkCandidate` for every rule as "what this part makes new or worse", so a problem the build already has isn't blamed on every candidate in the picker. There is no UI in this story.

## 2. Behavior

As in spec 018, this is pure TypeScript in `lib/builder/`. "The shopper sees" means what #53 (summary) and #54 (slot picker) will show from the output.

1. **`estimateWattage(build)`** gives the build's estimated power draw in whole watts: (CPU `tdpW` + GPU `boardPowerW` + `OTHER_PARTS_ALLOWANCE_W`) × 13 / 10, rounded to the nearest watt (halves up), all in whole numbers. The allowance is 0 (Rules › Power). A part that isn't picked counts as 0 W.
2. **With a PSU picked**, the result also carries the PSU's `wattageW` and the load (`loadPercent`, rounded **up** to a whole percent). **Without a PSU**, both are `null`: the estimate is still there, with no percentage.
3. **`checkBuild(build)`** now runs 14 rules. The five new ones take their PRD table rows, so the order stays "errors first, then PRD table order": socket match, memory type, **memory slots, memory capacity**, form factor, GPU length, cooler height, cooler socket, radiator fit, **PSU wattage**, PSU form factor, **M.2 slots, integrated graphics**, BIOS update.
4. **Memory slots** (error): the kit's modules × quantity are more than the board's `memorySlots`.
5. **Memory capacity** (warning): the kit's capacity × quantity is more than the board's `maxMemoryGb`.
6. **PSU wattage**: error when the estimate is more than the PSU's `wattageW` (over 100%); warning when it is more than 80% of it. At exactly 80% or less, no issue. The comparison uses the rounded watts the shopper sees.
7. **M.2 slots** (warning): the M.2 drives (any `M2_*` form factor, NVMe or SATA), counted with each entry's quantity, are more than the board's `m2Slots`. 2.5" and 3.5" drives don't count.
8. **Integrated graphics** (warning): a CPU with no integrated graphics is picked and the GPU slot is empty.
9. **`checkCandidate(build, slot, part, options?)`** (redefined, for all 14 rules) returns the issues that are **new or more severe** in the build with the candidate than in the **baseline**: the same build with that slot empty (for storage, the build without the candidate's change; Rules › checkCandidate). An issue the build already has at the same severity isn't reported against the candidate. #54 shows those existing build-level problems in a banner (D9).
10. Wherever the estimate is shown it is called "estimated": in the PSU wattage messages and in the summary copy #53 renders (Messages).

**Empty state:** an empty build gives `checkBuild` `[]` and `estimateWattage` `{ watts: 0, psuWatts: null, loadPercent: null }`. A PSU alone gives `{ watts: 0, psuWatts: 850, loadPercent: 0 }` and no issue.
**Loading state:** none. Synchronous, no network (as spec 018).
**Error state:** as spec 018. `estimateWattage` throws `InvalidBuildError` only for a build that breaks the slot limits (a bug). Builds from `parseBuild` → `assembleBuild` never do.

## 3. Examples

Parts are real seed parts by name; "Build A/B/C" are spec 001's builds. Wattage = (CPU `tdpW` + GPU `boardPowerW`) × 13 / 10, rounded. Fixtures are hand-written parts, named as fixtures in the tests. Numbers and units in messages are joined by a non-breaking space, as in spec 018 (`specValue`).

### Wattage estimate

| # | Build | `estimateWattage` |
| --- | --- | --- |
| E1 | Empty | `{ watts: 0, psuWatts: null, loadPercent: null }` |
| E2 | Ryzen 5 7600 only (88 W) | 114.4 → `{ watts: 114, psuWatts: null, loadPercent: null }` (estimate before a PSU) |
| E3 | Ryzen 5 7600 + RTX 4060, no PSU | 203 × 13 / 10 = 263.9 → 264, no percentage |
| E4 | ROG Astral RTX 5090 only (575 W) | 747.5 → 748 (a half rounds up) |
| E5 | Build A (MWE 550) | 264 W / 550 W → `loadPercent: 48` |
| E6 | Build B (RM850e) | 398 → 517.4 → 517 W / 850 W → 61 (60.8 rounded up) |
| E7 | Build C (SF750) | 338 → 439.4 → 439 W / 750 W → 59 (58.5 rounded up) |
| E8 | Corsair RM850e alone | `{ watts: 0, psuWatts: 850, loadPercent: 0 }` |
| E9 | Build A without memory, storage, case and cooler | still 264 W: only the CPU and GPU count |

### PSU wattage (spec 001 and spec 011 scenarios)

| # | Build | Estimate / PSU | Expected |
| --- | --- | --- | --- |
| E10 | Builds A, B, C | 48%, 61%, 59% | no psu-wattage issue. A and C stay `[]`; B stays bios-update only |
| E11 | Ryzen 7 9800X3D + RTX 5090 Astral + RM850e | 958 / 850 (113%) | error: "The AMD Ryzen 7 9800X3D and the ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB need an estimated 958 W, more than the 850 W the Corsair RM850e (2023) 850W supplies." parts: cpu, gpu, psu |
| E12 | i5-14400F + RTX 5070 SFF + MWE 550 | 517 / 550 (94%) | warning: "The Intel Core i5-14400F and the Gigabyte GeForce RTX 5070 Windforce OC SFF 12G need an estimated 517 W, 94% of the 550 W the Cooler Master MWE 550 Bronze V2 supplies, close to its limit." |
| E13 | Ryzen 7 9800X3D + RTX 5090 Astral + Corsair RM1200x SHIFT | 958 / 1200 (79.8%, shown 80%) | none: the 5090 passes with the 1200 W PSU (spec 011) |
| E14 | Same with Seasonic FOCUS GX-1000 | 958 / 1000 (96%) | warning (spec 011: "still a warning") |
| E15 | Intel Core i9-14900K + RTX 5090 Astral + RM1200x SHIFT | 828 → 1076 / 1200 (90%) | warning |
| E16 | RTX 5090 Astral + MWE 550, no CPU | 748 / 550 | error naming only the GPU: "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB needs an estimated 748 W, more than the 550 W the Cooler Master MWE 550 Bronze V2 supplies." parts: gpu, psu |
| E17 | i5-14400F + MWE 550, no GPU | 192 / 550 | no psu-wattage issue (integrated-graphics warning, E38) |
| E18 | 9800X3D + RTX 5090 Astral, no PSU | 958, no PSU | no psu-wattage issue |

### Boundaries and integer math

Every comparison is in whole numbers: error when watts > PSU watts; warning when watts × 100 > PSU watts × 80; `loadPercent` = watts × 100 / PSU watts rounded up.

| # | Build | Watts / PSU | Expected |
| --- | --- | --- | --- |
| E19 | Ryzen 9 9950X + ASUS Dual RTX 3060 V2 + MSI MAG A650BN | 400 → 520 / 650: **exactly 80%** | none, `loadPercent: 80` |
| E20 | Intel Core i7-14700K + RTX 3060 V2 + MWE 550 | 423 → 549.9 → 550 / 550: **exactly 100%** | warning, not an error, `loadPercent: 100`. The rounded 550 W the shopper sees is what's compared |
| E21 | Core Ultra 7 265K + ASUS Prime RTX 5070 + MAG A650BN | 500 → 650 / 650: **exactly 100%** | warning, `loadPercent: 100` |
| E22 | Ryzen 5 7600 + RTX 4060 + fixture 329 W PSU | 264 / 329 (80.2%) | warning, `loadPercent: 81` |
| E23 | Ryzen 5 7600 + RTX 4060 + fixture 263 W PSU | 264 / 263 (100.4%) | error, `loadPercent: 101` |
| E24 | i7-14700K + RTX 3060 V2 + Seasonic GX-1000 | 550 / 1000: exactly 55% | `loadPercent: 55`. In floating point, 550 / 1000 × 100 is 55.00000000000001, which rounds up to 56 |
| E25 | Ryzen 9 9950X + Sapphire NITRO+ RX 9070 XT + MAG A650BN | 560 → 728 / 650: exactly 112% | error, `loadPercent: 112` (floating point: 113) |
| E26 | i5-14400F + MSI RTX 5080 Gaming Trio + RM1200x SHIFT | 660 / 1200: exactly 55% | `loadPercent: 55` (floating point: 56) |

At exactly 80% and 100% (E19–E21) the usual floating-point expressions happen to land on the right side for these values. The whole-number comparisons guarantee it for every value, and E24–E26 show floating point getting an exact percentage wrong.

### Memory slots (error) and memory capacity (warning)

| # | Build | Expected |
| --- | --- | --- |
| E27 | Build C with 2 × Vengeance DDR5 (2 modules each) on B650I Lightning (2 slots) | error: "2 kits of the Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 make 4 memory modules, but the ASRock B650I Lightning WiFi has 2 memory slots." parts: memory, motherboard. No capacity issue (64 ≤ 128 GB) |
| E28 | Corsair Vengeance DDR5-6000 64 GB (4×16 GB) ×1 on B650I Lightning | error: "The Corsair Vengeance DDR5-6000 64 GB (4×16 GB) CL36 has 4 memory modules, but the ASRock B650I Lightning WiFi has 2 memory slots." |
| E29 | Same 4-module kit ×1 on ROG Strix B650-A (4 slots) | none (equal fits) |
| E30 | Kingston FURY Beast DDR5-5600 16 GB (1×16 GB) ×2 on B650I Lightning | none (2 = 2) |
| E31 | Corsair Vengeance DDR5-6400 96 GB (2×48 GB) ×2 on ROG Strix B650-A (4 slots, 192 GB) | none: 4 modules and 192 GB, both equal |
| E32 | Corsair Vengeance LPX DDR4-3200 64 GB (2×32 GB) ×2 on ASRock H610M-HDV/M.2 R2.0 (2 slots, 64 GB) | `[memory-slots error, memory-capacity warning]`, the only seed case for capacity, and only beside a slots error. Capacity: "2 kits of the Corsair Vengeance LPX DDR4-3200 64 GB (2×32 GB) CL16 make 128 GB, more than the 64 GB the ASRock H610M-HDV/M.2 R2.0 supports." |
| E33 | Same kit ×1 on the H610M | none (64 = 64) |
| E34 | Fixture DDR5 board (4 slots, `maxMemoryGb: 64`) + Vengeance DDR5-6400 96 GB ×1 | warning only: "The Corsair Vengeance DDR5-6400 96 GB (2×48 GB) CL32 is 96 GB, more than the 64 GB the Fixture board-64gb supports." |
| E35 | Build A with FURY Beast DDR4 ×2 (DDR4 on a DDR5 board) | memory-type error only: 4 modules ≤ 4 slots, 32 ≤ 192 GB. The count rules run whatever the memory type |
| E36 | Memory with no board, or a board with no memory | none |

### Integrated graphics (warning)

| # | Build | Expected |
| --- | --- | --- |
| E37 | Build B without a GPU | `[integrated-graphics, bios-update]` (both warnings, PRD order) |
| E38 | i5-14400F alone (nothing else picked) | warning: "The Intel Core i5-14400F has no integrated graphics, so add a graphics card to get a display." parts: cpu |
| E39 | Ryzen 5 7600 (integrated graphics), no GPU | none |
| E40 | i5-14400F + RTX 4060 | none |
| E41 | No CPU, no GPU | none |

### M.2 slots (warning)

| # | Build | Expected |
| --- | --- | --- |
| E42 | Build C with storage [990 PRO ×2, SN850X] on B650I Lightning (2 slots) | warning: "This build has 3 M.2 drives, but the ASRock B650I Lightning WiFi has 2 M.2 slots, so 1 drive won't have a slot." parts: motherboard, then each M.2 drive in storage order |
| E43 | E42 plus Crucial MX500 (2.5" SATA) | the same warning, still 3 drives. The MX500 is not in `parts` |
| E44 | Build C with [990 PRO, SN850X] | none (2 = 2) |
| E45 | H610M (1 slot) + WD_BLACK SN770M (M.2 2230) + 990 PRO | warning: "This build has 2 M.2 drives, but the ASRock H610M-HDV/M.2 R2.0 has 1 M.2 slot, so 1 drive won't have a slot." (2230 counts) |
| E46 | H610M + Seagate BarraCuda 2TB (3.5") ×3 | none |
| E47 | Fixture board with `m2Slots: 0` + 990 PRO | warning: "This build has 1 M.2 drive, but the Fixture board-no-m2 has no M.2 slots." |
| E48 | Storage with no board | none |

### Several rules together

| # | Build | Expected |
| --- | --- | --- |
| E49 | Build C with 2 × Vengeance DDR5, storage [990 PRO ×2, SN850X], ROG Astral RTX 5090, RM850e | errors: memory-slots, gpu-length, psu-wattage (862 / 850), psu-form-factor; then the m2-slots warning. Status errors |
| E50 | Spec 018's `checkBuild` examples | Their expectations still hold. Spec 018's rule tests check one rule each (`checkRule`). Its whole-build tests (E1–E4, E43–E45) trip none of the new rules (Test plan › Spec 018 tests) |

### `checkCandidate`: spec 018 examples under the new definition

| # | Spec 018 example | Baseline (slot empty) | Result |
| --- | --- | --- | --- |
| E51 | E46: Ryzen 5 7600, candidate PRO B760M-A DDR4 | no board: no issue | `[socket-match]`, unchanged |
| E52 | E47: Ryzen 5 7600, candidate ROG Strix B650-A | — | `[]`, unchanged |
| E53 | E48: Ryzen 5 7600 + PRO B760M-A DDR4, candidate LANCOOL 216 | no case: the socket error is already there | `[]`, unchanged (the error is not new) |
| E54 | E49: Build A with 2 × Vengeance DDR5, candidate FURY Beast DDR4 | no memory | `[memory-type]`, unchanged. Memory slots: 4 ≤ 4 |
| E55 | E50: Build A, add SN850X | Build A as given | `[]`, unchanged (2 M.2 drives, 3 slots) |
| E56 | E52: i5-14400F + ROG Strix B650-A, candidate Ryzen 5 7600 | no CPU | `[]`, unchanged |
| E57 | E53: Ryzen 5 7600 + ROG Strix B650-A, candidate 9800X3D | no CPU | `[bios-update]`, unchanged |
| E58 | E54: Build C, candidate Peerless Assassin | no cooler | `[cooler-height]`, unchanged |
| E59 | E59: Build A, candidate Ryzen 5 7600; Build B, candidate i5-14400F | no CPU | `[]` and `[bios-update]`, unchanged |
| E60 | PRO B760M-A DDR4 + NH-L9a-AM5 (cooler-socket error naming the board, spec 018 E27), candidate i5-14400F | no CPU: cooler-socket error against the board | **`[integrated-graphics, bios-update]`**: its own issues (no GPU yet, an early B760 BIOS), and no cooler-socket error (under spec 018 the CPU also got a cooler-socket error naming it). The cooler is the problem, and the build already shows it. The only one of the nine rules whose result changes (Rules › checkCandidate) |
| E61 | Same build, candidate Ryzen 5 7600 | same | `[socket-match]`, unchanged. The cooler-socket error goes away (the AM5 CPU fits the cooler) |

### `checkCandidate`: power

| # | Build | Candidates | Expected |
| --- | --- | --- | --- |
| E62 | RTX 5090 Astral + MWE 550 (748 / 550: error already) | every seed CPU, Ryzen 5 7600 to i9-14900K | `[]` on every CPU: no CPU makes the error new or worse |
| E63 | RTX 5090 Astral + RM850e (748 / 850, 88%: warning) | Ryzen 5 7600 | psu-wattage **error** (862 / 850): the CPU turns a warning into an error, so it is shown |
| E64 | RTX 5090 Astral + fixture 900 W PSU (748 / 900, 84%: warning) | Ryzen 5 7600 / Ryzen 7 9800X3D | `[]` (862 W, 96%: still a warning) / psu-wattage error (958 > 900) |
| E65 | RTX 5090 Astral + Seasonic GX-1000 (748 / 1000, 75%: none) | Ryzen 5 7600 / 9800X3D / i9-14900K | warning (862 W, 87%) / warning (958 W, 96%) / error (1076 W) |
| E66 | Ryzen 7 9800X3D + RTX 5090 Astral (958 W, no PSU) | MWE 550, Corsair SF750, RM850e, GX-1000, RM1200x SHIFT | error, error, error, warning (96%), `[]`. The baseline has no PSU, so the rule is silent and every issue is the candidate's |
| E67 | Ryzen 7 9800X3D + MWE 550 (211 W, 39%) | GPU RTX 4060 / RTX 5070 SFF / RTX 5090 Astral | `[]` (360 W, 66%) / warning (536 W, 98%) / error (958 W) |

### `checkCandidate`: counts and integrated graphics

| # | Build | Call | Expected |
| --- | --- | --- | --- |
| E68 | Build C with storage [990 PRO, SN850X] | NV3 with `{ replace: SN850X }` | `[]`: baseline [990 PRO], still 2 drives (spec 018 E55's deferred assertion) |
| E69 | Same | add NV3 | `[m2-slots]`: 2 → 3 drives on 2 slots, new |
| E70 | Same | add Crucial MX500 | `[]` |
| E71 | Build C with storage [990 PRO ×2, SN850X] (3 on 2 slots: warning already) | add NV3 / add MX500 | `[]` / `[]`: the warning is already there at the same severity. With "storage slot empty" as the baseline, the MX500 would wrongly get the M.2 warning (D8) |
| E72 | Ryzen 5 7600 + storage [990 PRO ×2, SN850X] | board B650I Lightning / X870E AORUS ELITE (4 slots) | `[m2-slots]` / `[]` |
| E73 | Ryzen 5 7600 + B650I Lightning | memory Vengeance DDR5 4×16 kit | `[memory-slots]` |
| E74 | i5-14400F, no GPU (integrated-graphics warning) | GPU RTX 4060 | `[]`: the warning goes away. Removed issues are never reported |
| E75 | Empty build | CPU i5-14400F / Ryzen 5 7600 | `[integrated-graphics]` / `[]` |

### Coverage

| # | Input | Expected |
| --- | --- | --- |
| E76 | Today's `rules-coverage.test.ts` | Passes with no metadata change: every new rule's fields are already required and tagged (`memorySlots`, `maxMemoryGb`, `m2Slots`, `moduleCount`, `capacityGb`, storage `formFactor`, `tdpW`, `boardPowerW`, `wattageW`, `hasIntegratedGraphics`) |

## 4. Rules and edge cases

### When each rule runs

| Rule | Runs when | Fails when | Severity | `parts` |
| --- | --- | --- | --- | --- |
| memory-slots | memory, motherboard | `moduleCount × quantity > memorySlots` | error | memory, motherboard |
| memory-capacity | memory, motherboard | `capacityGb × quantity > maxMemoryGb` | warning | memory, motherboard |
| psu-wattage | psu, and cpu **or** gpu | watts > `wattageW` → error; watts × 100 > `wattageW` × 80 → warning | error / warning | cpu (if picked), gpu (if picked), psu |
| m2-slots | motherboard, at least one M.2 drive | M.2 drive count (with quantity) > `m2Slots` | warning | motherboard, then the M.2 drives in storage order |
| integrated-graphics | cpu, and **no** gpu | `hasIntegratedGraphics` is false | warning | cpu |

- **Boundaries fit:** equal counts, equal capacity and exactly 80% are allowed; exactly 100% is a warning, not an error (E19–E21, E29–E31, E33, E44). The PRD says "over 100%" and "above 80%".
- **One issue per rule** still holds. PSU wattage gives an error or a warning, never both. M.2 slots gives one warning for the whole storage slot.
- **The count rules ignore memory type.** A DDR4 kit on a DDR5 board still gets the slots and capacity checks (E35).
- **Memory capacity is not silenced by memory slots** (E32). Unlike BIOS update on a socket mismatch, the capacity fact still means something with too many sticks.
- **Integrated graphics** warns from the first pick of a CPU without integrated graphics, before the shopper reaches the GPU slot (E38). The message is worded as the next step to take. It ignores the board's video outputs (spec 001 Out of scope).

### Power

- **Formula, in whole numbers:** watts = (cpu `tdpW` + gpu `boardPowerW` + `OTHER_PARTS_ALLOWANCE_W`) × 13 / 10, rounded half up. The allowance sits inside the sum, matching the PRD's "sum of part TDP/TBP × 1.3".
- **Severity** compares whole numbers on the rounded watts the shopper sees: error when watts > PSU watts, warning when watts × 100 > PSU watts × 80. The message, the summary and the status always agree.
- **`loadPercent`** = watts × 100 / PSU watts, rounded **up**, in whole numbers. A warning never shows "80%" and an error never shows "100%" (E19–E23), and every percentage spec 001 lists comes out the same (48, 61, 59, 94, 113). Floating point would show 56% for an exact 55% (E24–E26).
- **`OTHER_PARTS_ALLOWANCE_W = 0`, and why:**
  - The CPU and GPU figures are already worst case: `tdpW` is full-boost package power (Intel Maximum Turbo Power, AMD PPT), and `boardPowerW` is TBP (spec 001 R2, R8).
  - The ×1.3 adds 30% of that pair: at least 61 W on the lightest seed pair (Ryzen 5 7600 + RTX 4060: 203 → 264 W), and over 200 W on a high-end one. A board, two DIMMs, a couple of drives and fans draw about 40–80 W, so the headroom already covers them.
  - A non-zero allowance would change settled results. With 50 W, spec 001's i5-14400F + RTX 5070 + MWE 550 goes from a warning (517 W, 94%) to an error (582 W), which breaks the issue's AC.
  - As one named constant, it is the single place to change if real measurements disagree. Memory and storage don't enter the estimate (E9).
- **Before a PSU is picked** the estimate is available, with `psuWatts` and `loadPercent` `null` (E2, E3). The rule is silent.
- **A PSU alone:** the rule needs a CPU or a GPU, so it stays silent even if the allowance is ever raised. `estimateWattage` still reports 0 W and 0%.

### `checkCandidate` (replaces spec 018's definition)

- **Definition:** `checkCandidate` returns, from `checkBuild(applyCandidate(build, slot, part, options))`, every issue whose rule has **no issue, or a less severe one**, in `checkBuild(baseline)`. Severity ranks none < warning < error. The returned issue is the one from the build with the candidate (its message and parts).
- **Baseline:**

  | Slot | Baseline |
  | --- | --- |
  | cpu, motherboard, memory, gpu, case, psu, cpu-cooler | the build with that slot empty |
  | storage, adding (no `replace`) | the build as given |
  | storage, `{ replace: id }` | the build without the replaced drive |

  For storage, "slot empty" would make every existing drive look new: a SATA drive added to a build already over its M.2 slots would get the M.2 warning (E71, D8).
- **Removed issues** (the candidate fixes a problem) are never reported (E74).
- **The nine spec 018 rules give the same results, with one exception.** Each of them except cooler socket reads the candidate's slot, so with that slot empty it is silent. Every issue it raises with the candidate is therefore new, and it lists the candidate in `parts`, which is exactly spec 018's "issues that involve the candidate" (E51–E59). Cooler socket is the exception for a **CPU** candidate. With no CPU, the rule falls back to the board's socket, so a cooler that doesn't fit the board is already an error in the baseline. A CPU on the board's socket no longer gets that error, though it still gets its own issues, such as integrated graphics and BIOS update (E60). A CPU on another socket gets the socket-match error as before (E61).
- **The new rules under this definition:**
  - PSU wattage: a CPU or GPU candidate gets the issue only when it creates it or turns a warning into an error (E62–E65, E67). PSU candidates always get it, since the baseline has no PSU (E66).
  - M.2 slots: a drive that pushes the count over gets the warning. Once the build is already over, further drives don't (E69–E71). Boards are judged against the drives already picked (E72).
  - Memory slots and capacity: as before (E73). A memory candidate keeps the slot's quantity (spec 018 D12).
  - Integrated graphics: a GPU candidate never gets it. A CPU candidate gets it when there is no GPU (E74–E75).
- `applyCandidate`, its options and its errors are unchanged. A candidate that is already the slot's part gives the issues it adds compared with the slot empty.
- **Cost:** each call runs `checkBuild` twice (with the candidate and the baseline). The benchmark is re-run; #54 owns the 100 ms budget.

### Purity and order

- As spec 018: no I/O, inputs never mutated, deterministic output. The five rules go into `RULES` at their PRD rows.
- `estimateWattage` and the psu-wattage rule share one calculation, so the summary figure and the message figure can't differ.

## 5. Messages and copy

Formatting as spec 018 (`specValue`: "550 W", "64 GB", joined with a non-breaking space). Names are `Product.name`. Counts use the singular for 1 ("1 M.2 slot", "1 drive", "1 memory slot").

| Rule | Message |
| --- | --- |
| memory-slots, quantity 1 | The {memory} has {modules} memory modules, but the {board} has {memorySlots} memory slots. |
| memory-slots, quantity > 1 | {quantity} kits of the {memory} make {modules} memory modules, but the {board} has {memorySlots} memory slots. |
| memory-capacity, quantity 1 | The {memory} is {totalGb}, more than the {maxMemoryGb} the {board} supports. |
| memory-capacity, quantity > 1 | {quantity} kits of the {memory} make {totalGb}, more than the {maxMemoryGb} the {board} supports. |
| psu-wattage, error | The {loads} need{s} an estimated {watts}, more than the {psuWatts} the {psu} supplies. |
| psu-wattage, warning | The {loads} need{s} an estimated {watts}, {loadPercent}% of the {psuWatts} the {psu} supplies, close to its limit. |
| m2-slots | This build has {count} M.2 drives, but the {board} has {m2Slots} M.2 slots, so {extra} drive(s) won't have a slot. |
| m2-slots, board has none | This build has {count} M.2 drive(s), but the {board} has no M.2 slots. |
| integrated-graphics | The {cpu} has no integrated graphics, so add a graphics card to get a display. |

`{loads}` is "{cpu} and the {gpu}" when both are picked (verb "need"), or whichever one is picked (verb "needs").

Summary copy for #53 to render (defined here so the figure is always labelled "Estimated"):

| State | Text |
| --- | --- |
| No PSU | Estimated power: {watts} |
| PSU picked | Estimated power: {watts} of {psuWatts} ({loadPercent}%) |

The tooltip explaining the ×1.3 headroom is #53's copy (D12). No new developer-facing strings.

## 6. Data and interfaces

No database, route or schema change. `lib/builder` gains:

| Name | What it is |
| --- | --- |
| `PowerEstimate` | `{ watts: number; psuWatts: number \| null; loadPercent: number \| null }` |
| `estimateWattage(build): PowerEstimate` | Behavior 1–2. Throws `InvalidBuildError` on a malformed build, like `checkBuild` |
| `PSU_HEADROOM_TENTHS` | 13: the PRD's ×1.3 as a whole-number ratio over 10 |
| `OTHER_PARTS_ALLOWANCE_W` | 0 (Rules › Power) |
| `PSU_WARNING_PERCENT` | 80 |
| Five rules | `memory-slots`, `memory-capacity`, `psu-wattage`, `m2-slots`, `integrated-graphics`, one file each in `lib/builder/rules/`, listed in `RULES` at their PRD rows |

- `checkCandidate` keeps its signature. Its result follows the new definition (Rules › checkCandidate). `checkBuild`, `applyCandidate` and `buildStatus` are unchanged.
- `lib/specs`: no change (E76).
- Docs:
  - Spec 018 gets the new `checkCandidate` definition (Behavior 6, Rules › checkCandidate, D11, E59's wording), with a note that spec 019 amended it.
  - `CLAUDE.md`'s `lib/builder` line gets `estimateWattage`, the constants and the new `checkCandidate` wording.
  - `docs/prd.md` is unchanged (the formula and thresholds already match). No ADR.

## 7. Test plan

Builder rules are test-first in Vitest (PRD testing strategy). All unit tests, no database.

| Level | File | Covers |
| --- | --- | --- |
| Unit, written first | `lib/builder/rules/memory-slots.test.ts`, `memory-capacity.test.ts`, `psu-wattage.test.ts`, `m2-slots.test.ts`, `integrated-graphics.test.ts` | E10–E23, E27–E48 through `checkRule`; fixtures E22–E23, E34, E47 |
| Unit, written first | `lib/builder/power.test.ts` | `estimateWattage`: E1–E9, rounding (E3–E7), exact boundaries (E19–E21), `loadPercent` (E22–E26) |
| Unit | `lib/builder/check.test.ts` | Builds A/B/C unchanged with 14 rules (E10), ordering E49 |
| Unit, written first | `lib/builder/candidate.test.ts` | New definition: E60–E75. Spec 018's E46–E59 stay as they are (E51–E59) |
| Unit | `lib/specs/rules-coverage.test.ts` | E76, unchanged |
| Benchmark | `lib/builder/check.bench.ts` | Re-run with 14 rules and the two-build `checkCandidate`; not in CI |

### Spec 018 tests

No spec 018 test's expected result changes. Each test that compares a whole result was checked against the five new rules and the new `checkCandidate`:

| Test | Result | Why no new rule trips |
| --- | --- | --- |
| check › E1, E3: builds A and C have no issues | `[]` → `[]` | 48% and 59% load; GPU picked; memory and M.2 within the board's slots |
| check › E2: build B has one warning | `[bios-update]` → same | 61% load; GPU picked; MX500 isn't M.2 |
| check › E4: empty build | `[]` → `[]` | nothing picked |
| check › E43: errors come before warnings | `[psu-form-factor, radiator-fit]` → same | 439 / 850 W (52%) |
| check › E44: same severity follows the PRD table | `[socket-match, memory-type]` → same | i5-14400F + RTX 4060: 342 / 550 W (63%); 2 modules in 4 slots |
| check › warning never outranks an error | sorted severities → same | asserts order only |
| check › same answer twice; throws on bad slots | unchanged | not result-specific |
| buildStatus › E45 | `checkBuild(B)[0]` is still bios-update; `checkBuild(A with i5-14400F)[0]` is still socket-match | as E2, E44 |
| candidate › E46–E54, E59 | unchanged | E51–E59 above |
| candidate › E55–E58, "doesn't change the build" | unchanged | `applyCandidate` only |

The rule tests (`lib/builder/rules/*.test.ts`) already check one rule each through `checkRule(rule, build)`, never a whole `checkBuild` result, so none needs to filter by rule id. The new rule tests do the same. One wording change: candidate › E59 is renamed from "gives its current issues" to "gives the issues it adds". Its expectations stay. E60 is added to `candidate.test.ts` as the one behavior the new definition changes.

- Seed parts come through `test-support/seed-parts.ts`. Add to `seed`: RM1200x SHIFT, GX-1000, MAG A650BN, SF750, i9-14900K, i7-14700K, Core Ultra 7 265K, Ryzen 9 9950X, RTX 3060 V2, Prime RTX 5070, RTX 5080 Gaming Trio, the 4-module, 96 GB, 1×16 GB DDR5 and LPX 64 GB kits, NV3, SN770M, BarraCuda 2TB, H610M.
- No integration or E2E tests: there is no UI or database in this story. The DoD's "checked on the preview URL" can't apply until #53 renders the summary, so these unit tests are what verify the ACs.

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Rendering the estimate and status in the summary; the ×1.3 tooltip | #53 |
| Banner in the slot picker for build-level problems that candidates aren't blamed for (D9); hiding or greying candidates by severity | #54 |
| Blocking "Add build to cart" on errors, acknowledging warnings | Checkout epic |
| Power for memory, storage, fans, peripherals; transient spikes; PSU efficiency or 12V-rail checks; GPU power connectors | Not in the MVP (the allowance constant is the hook) |
| NVMe-only M.2 slots, M.2 slots that disable SATA ports, PCIe adapter cards | Not in the MVP (spec 001 Out of scope) |
| Board video outputs for integrated graphics | Not in the MVP |
| Memory quantity limits in the stepper | #53 |

## 9. Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | `OTHER_PARTS_ALLOWANCE_W = 0` | Worst-case CPU/GPU figures plus 30% already cover the rest; a non-zero value breaks spec 001's settled warning (Rules › Power) | A 50–75 W flat allowance |
| D2 | Allowance inside the sum, before × 13 / 10 | Matches the PRD's "sum of part TDP/TBP × 1.3" | Added after the factor |
| D3 | Whole-number math: watts rounded half up; severity compares the rounded watts | Exact at every boundary, and what's judged is what's shown. Reproduces spec 001's figures (264, 517, 439, 958) | Floating point with `1.3` and `0.8` (E24–E26); rounding watts up (contradicts spec 001) |
| D4 | `loadPercent` rounded up | It can never contradict the status, and it matches spec 001's percentages | Nearest whole percent |
| D5 | PSU wattage runs with a PSU and at least one of CPU or GPU | A GPU alone can overload a small PSU (E16); a PSU alone has nothing to judge | Requiring both CPU and GPU |
| D6 | `estimateWattage` returns `{ watts, psuWatts, loadPercent }` with nulls before a PSU | One call serves the summary in both states | Separate `estimateWattage` and `psuLoad` functions |
| D7 | `checkCandidate` = issues new or more severe than in the baseline, for every rule (review decision) | One rule for all 14: a part is blamed only for what it changes. Without it, an over-budget PSU would leave every CPU flagged and the "compatible only" list empty (E62) | Special-casing PSU wattage; spec 018's "issues that involve the candidate" |
| D8 | For storage, the baseline is the build without the candidate's change, not an empty storage slot | With all drives removed, an existing M.2 overflow would look new and a SATA candidate would get the M.2 warning (E71). This narrows the review's "that slot empty" for the one multi-entry slot | Emptying storage like the other slots |
| D9 | #54 (the slot picker) shows a banner for build-level errors the build already has, since `checkCandidate` no longer repeats them on each candidate. The review called it "story 5"; the epic has four stories (#51–#54), and #54 is the picker | The shopper still learns why the build is blocked, once, above the list (e.g. "The build needs more power than the MWE 550 supplies") | Repeating the error on every candidate |
| D10 | Memory capacity and memory slots both report when both fail | Independent facts; neither makes the other meaningless | Silencing capacity, like BIOS update on a socket mismatch |
| D11 | One M.2 warning listing every M.2 drive in `parts` | The UI can mark all of them; the message counts instead of naming, so it stays short | One issue per extra drive |
| D12 | PSU warning says "close to its limit"; the ×1.3 explanation is a tooltip in #53 (review decision) | The message stays short; the summary is where the figure is explained | Explaining the headroom in the message |
| D13 | Integrated graphics is worded as a next step ("so add a graphics card to get a display") (review decision) | It fires early in the flow, before the GPU slot, so it reads as guidance, not a fault | "…needs a graphics card to show a picture" |
| D14 | Summary copy is defined here, rendered by #53 | The AC "labelled Estimated" belongs to this story | Leaving all wording to #53 |

## 10. Open questions

None. Both draft questions were settled in review: the generalized `checkCandidate` (D7–D9) and the warning wording (D12). D8 (storage baseline) and D9 (#54 for "story 5") interpret the review; correct them if they're not what you meant.

## Acceptance criteria mapping

| Acceptance criterion (#52) | Covered by |
| --- | --- |
| Memory slots: error when `moduleCount × quantity` > `memorySlots` | Behavior 4; Rules table; E27–E32 |
| Memory capacity: warning when `capacityGb × quantity` > `maxMemoryGb` (fixtures) | Behavior 5; E31–E34 (E34 fixture; E32 the only seed case, beside a slots error) |
| M.2 slots: warning on M.2 drives (NVMe or SATA), with quantity, > `m2Slots` | Behavior 7; E42–E48, E68–E72 |
| Integrated graphics: warning when CPU has no iGPU and no GPU | Behavior 8; E37–E41, E74–E75 |
| `estimateWattage` follows the PRD formula; allowance constant = 0 with reasoning | Behavior 1; Rules › Power; D1–D3; E1–E9 |
| PSU wattage: error over 100%, warning above 80%; boundaries tested | Behavior 6; E19–E23 |
| Spec 001 / 011 power scenarios keep their results | E10–E15 |
| Estimate available before a PSU is picked (no percentage) | Behavior 2; E2, E3, E18 |
| Labelled "Estimated" wherever shown | Behavior 10; Messages (psu-wattage messages, summary copy); D14 |
