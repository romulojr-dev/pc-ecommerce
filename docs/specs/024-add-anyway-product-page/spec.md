# 024 — Add to build on a "Doesn't fit" product page asks first

Status: **Approved** (short form, review changes applied) · Issue: #68 (epic #3, depends on #61, merged) · PRD refs: FR-10 (Product page); PC Builder › Flow (step 3); PC Builder › Compatibility rules (errors block "Add build to cart")

## 1. Summary

A product page whose "Fit with your build" block (spec 023) reads **Doesn't fit your build** now asks before **Add to build** changes the build. The dialog is the slot picker's confirmation (spec 021, Behavior 15): it names the errors and offers **Add anyway** and **Cancel**. Parts that fit, fit with warnings, or have no hint are added as today. When the part would also replace another one, the shopper sees one dialog, not two. A click made while the build's parts are still loading waits for them, then decides the same way. This changes spec 020 Behavior 19 (and so Behavior 22, 23 and D9, which said the product page never runs the rules), Section 6.

This is the short form (Summary, Behavior, Examples, Out of scope, Open questions). Kept beyond it, because the review needs them: the acceptance mapping, the list of earlier-spec changes and the decisions.

## 2. Behavior

### When it asks

1. Add to build asks first when **both** are true when the verdict is known:
   - the page's fit state is **Doesn't fit your build** (spec 023's `fitOf` gives `errors`: `checkCandidate` returned one or more errors, the picker's call); and
   - the add would change the build: spec 020's table says "add" (empty slot, or a new drive), or "confirm replace" (another part in a one-part slot or memory).
2. In every other case nothing is new:
   - **Fits your build**, **Fits, with warnings**, **In your build**, or no hint: spec 020 Behavior 19 as today. Warnings never ask (the Checkout epic asks the shopper to acknowledge them, spec 021 Behavior 15).
   - The part is already in the build ("In your build"): "Already in your build.", or the raise for memory and storage, as today. It asks nothing, because the hint doesn't say "Doesn't fit" (D2, D6).
   - Spec 020's "nothing changes" outcomes ("Your build already has all {stock} we have in stock.", "Your build has the most parts it can hold…") come first. A part that can't be added is not asked about (D4).
3. **The button's label** stays **Add to build**, and it is still disabled for a part that isn't buyable (spec 020 Behavior 18). The picker relabels its button "Add anyway" because its list shows the verdict on the card. The product page shows the verdict in the block above (D1).

### Clicking while the build is loading

4. The verdict needs the saved build read and its parts loaded (spec 023 Behavior 6). A click before that is **pending**, not ignored and not added at once:
   - the button is disabled, shows a spinner and is marked busy; its label stays "Add to build";
   - the status line under the buttons says "Checking your build…" (announced, like the other outcomes);
   - the saved build doesn't change;
   - more clicks do nothing.
5. **When the load succeeds**, the pending click gets the normal decision, from the build and the plan as they are at that moment: it asks (Behavior 1), shows today's "Replace?" dialog, or adds, exactly as if the shopper had clicked just then. "Checking your build…" is replaced by the dialog or by the add's own line.
6. **When the load fails**, the pending click adds **without asking**: the plan by spec 020's table, including today's "Replace?" dialog when the slot is filled. The failure shows no error text (spec 023 D11).
7. A pending click covers the moment before the saved build is read too (spec 020 Behavior 22 said such a click does nothing): it waits and applies, so it can't overwrite the saved build, and it isn't lost (D8).
8. Pending lasts as long as the load. There is no timeout of its own (D9). Leaving the page drops it.
9. When nothing needs loading (an empty saved build) or nothing is comparable, there is no wait: the click is decided at once.

### The dialog

10. Nothing is saved until **Add anyway**. The dialog is a modal (focus moves in, Escape cancels) and its content is the picker's confirmation:
    - title "Add a part that doesn't fit?";
    - "The {part} doesn't fit your build:" and every **error** message, as a list in the engine's order (warnings are not listed, as in the picker);
    - "You can still add it, but you can't add the build to your cart until this is fixed.";
    - **Cancel** and **Add anyway**.
11. **When the add also replaces a part** (one-part slot or memory filled with another product), the same dialog adds one sentence after the error list, before the cart line: "This also replaces the {slot noun} you picked." For memory with more than one kit it ends ", keeping {quantity} kits", as spec 020's "Replace?" dialog does. There is no second dialog, and the "Replace the {slot noun} in your build?" dialog doesn't open in that case.
12. **Add anyway** does what the "Replace" button or the plain click would have done (add, or replace in place keeping the memory quantity), then closes the dialog and shows "Added to your build." with "View build" (spec 020 Behavior 20). The hint on the page changes to **In your build**. The status on `/builder` shows Errors; the shopper was told.
13. **Cancel** or Escape: the saved build is unchanged and no status line shows. Focus returns to **Add to build**, as the "Replace?" dialog does today.

### Loading, empty and error states

14. The page makes **one** parts request, as before (spec 023 Behavior 13). The block and the button use the same verdict and the same loaded parts, so this story adds no request.
15. A failed request, an empty saved build and a build with nothing comparable show no hint and add as today (Behavior 6, 9). No error text is added.

### Not changed

16. The picker, `/builder`, the shared-build page, the hint's states and copy, and the "Replace?" dialog for parts that fit or have warnings (spec 020 E22–E24, E27–E29) are unchanged.

### Copy

| Where | Text |
| --- | --- |
| Title | Add a part that doesn't fit? |
| Body | The {part} doesn't fit your build: · each error message |
| Replace sentence (only when it also replaces) | This also replaces the {slot noun} you picked. · …, keeping {quantity} kits (memory, quantity above 1) |
| Cart line | You can still add it, but you can't add the build to your cart until this is fixed. |
| Buttons | Cancel · Add anyway |
| Pending, status line | Checking your build… |

All rows but the last two are the picker's strings, unchanged, except the replace sentence. `{slot noun}` is spec 020's (`SLOT_COPY`).

## 3. Examples

**Build A** is `buildA` in `test-support/seed-parts.ts` (Ryzen 5 7600, ASUS ROG Strix B650-A Gaming WiFi, Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30, Samsung 990 PRO 1TB, ASUS Dual RTX 4060, Lian Li LANCOOL 216, Cooler Master MWE 550, Thermalright Peerless Assassin 120 SE). Fit states and messages are spec 023's (E1–E10). Rows marked ✓ were run through `checkCandidate` on the current seed while writing this spec (scratch tests, deleted).

### The decision (unit: pure function over the saved items, the plan, the fit and the load status)

| # | Saved build | Product page | Expected |
| --- | --- | --- | --- |
| E1 | Build A | MSI PRO B760M-A WiFi DDR4 (LGA1700, DDR4), **Add to build** | **One** dialog "Add a part that doesn't fit?" with two errors in order: "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4." then "The Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 is DDR5 memory, but the MSI PRO B760M-A WiFi DDR4 takes DDR4." And "This also replaces the motherboard you picked." No "Replace the motherboard…?" dialog. Saved build unchanged (the AC's E2E) |
| E2 | E1 | **Cancel**, or Escape | Saved build still Build A. No status line. Focus on **Add to build** |
| E3 | E1 | **Add anyway** | Motherboard slot now the MSI board (the Strix is gone). "Added to your build. View build". The block reads **In your build**. `/builder` status Errors |
| E4 ✓ | Ryzen 5 7600 only | MSI PRO B760M-A WiFi DDR4 | Dialog with the one socket error ("The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4.") and **no** replace sentence (empty slot). Add anyway → added, `/builder` Errors (spec 020 E6) |
| E5 ✓ | Build A with Vengeance × 2 | Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 (**Doesn't fit**; stock 15) | One dialog with one error: "The Kingston FURY Beast DDR4-3200 16 GB (2×8 GB) CL16 is DDR4 memory, but the ASUS ROG Strix B650-A Gaming WiFi takes DDR5." Then "This also replaces the memory you picked, keeping 2 kits." Add anyway → Kingston × 2. With Vengeance × 1 the sentence has no "keeping" |
| E6 ✓ | Build A | ASRock B650M-HDV/M.2 (AM5, **Fits your build**) | Today's "Replace the motherboard in your build?" dialog only. No misfit dialog |
| E7 | Build A | AMD Ryzen 7 9800X3D (**Fits, with warnings**: BIOS update) | Today's "Replace the CPU in your build?" dialog. Warnings are not asked about |
| E8 ✓ | The Strix only | Ryzen 7 9800X3D (one warning, "The ASUS ROG Strix B650-A Gaming WiFi may need a BIOS update to run the AMD Ryzen 7 9800X3D: its launch BIOS supports Zen 4 (Ryzen 7000), not Zen 5 (Ryzen 9000).", empty CPU slot) | Added at once, "Added to your build." No dialog |
| E9 | Crucial MX500 only | Ryzen 5 7600 (no hint: nothing to compare, spec 023 E13) | Added at once, no dialog |
| E10 | Build A | The Strix (**In your build**) | "Already in your build." No dialog |
| E11 | Build A | Vengeance (**In your build**) | Raised to × 2, "Added to your build." No dialog (D2, D6) |
| E12 | Empty | MSI PRO B760M-A WiFi DDR4 | Added at once (no hint, nothing to compare) |
| E13 | Synthetic: a build of 20 products (spec 020 E33), a storage candidate whose fit is `errors` | — | "Your build has the most parts it can hold. Remove a drive to add another." No dialog: nothing would change. **A unit input, not a seed scenario:** `m2-slots` is a warning, and a build full of drives already has it, so no seed drive reads "Doesn't fit" ✓. The decision is generic over the slot, so it is tested with a made-up fit |
| E14 | A fit with an error and a warning (spec 023 E7's shape) | — | The dialog lists the error only |
| E15 | Status `loading`, a click | — | Pending: nothing saved, no dialog. When the status becomes `ready`, the same click is decided by the fit: `errors` → ask (E1), `fits` → add, `in-build` → "Already in your build." |
| E16 | Status `error`, a click | — | Added with no misfit dialog; a filled slot still gets today's "Replace?" dialog |

### On the page (component and E2E)

| # | Scenario | Expected |
| --- | --- | --- |
| E17 | Build A saved; open the MSI board's page; wait for **Doesn't fit your build** | **Add to build** opens the dialog by its title; it names the socket error; focus is inside it; Escape closes it and focus is back on **Add to build** |
| E18 | E17, **Cancel** | `localStorage` still holds Build A's eight items. No "Added to your build." |
| E19 | E17, **Add anyway** | The saved motherboard is the MSI board. The status line shows. The block reads **In your build** |
| E20 | **Click during load → asks.** Build A saved; the parts request held back (route not answered); click **Add to build** on the MSI board | The button is disabled and busy, "Checking your build…" shows, `localStorage` still holds Build A, a second click changes nothing. Release the request: the E1 dialog opens (the AC's E2E) |
| E21 | **Click during load → adds.** Only the Ryzen 5 7600 saved; the parts request held back; click **Add to build** on the ASRock B650M-HDV/M.2 (fits ✓) | Pending as in E20. Release the request: the board is added with no dialog, "Added to your build." |
| E22 | The parts request answers 500 with the Ryzen 5 7600 saved; click **Add to build** on the MSI board | The click waits for the failed request, then adds with no dialog: "Added to your build." The block shows no hint |
| E23 | Build A saved; ASRock board page, then Ryzen 7 9800X3D page | Only "Replace…?" dialogs (E6, E7) |
| E24 | Out-of-stock part (RTX 5090), pre-order part (Core Ultra 7 265K) | **Add to build** is disabled with its reason; no dialog (spec 020 E34, E35) |
| E25 | The picker's "Add anyway" on the same MSI board (spec 021 E13) | Unchanged: the same title, errors and buttons |
| E26 | E17 | Exactly one `GET /api/builder/parts` request for the page (spec 023 E25) |

Levels: E1–E16 are unit tests of the decision (a pure function, plus the pending state's transitions). The dialog's content (E1, E4, E5, E14) is a component test. E17–E22, E25 and E26 are the E2E (`e2e/`; E17–E19 and E20 are the AC's, E21 and E22 the load cases). E23 and E24 are covered by the unit rows and the existing E2E (`builder.spec.ts`, `product-page.spec.ts`). Holding a request back uses Playwright's route interception, so no sleeps. No database test: no query or schema change.

## 4. Acceptance mapping

The issue's fourth criterion ("before the build and its parts have loaded, Add to build behaves as today") is **amended by review**: a click while loading waits and then decides (Behavior 4–7). The failed-request case still behaves as today (Behavior 6).

| Acceptance criterion | Covered by |
| --- | --- |
| Add to build on a "Doesn't fit" page asks first, names the errors, **Add anyway** / **Cancel**, matching spec 021 Behavior 15 | Behavior 1, 10, 12, 13; E1–E5, E17–E19, E25 |
| Fit, warnings or no badge: added as today, no new confirmation | Behavior 2, 15; E6–E12, E23 |
| "Replace?" and the picker unchanged; both applying gives one dialog | Behavior 11, 16; E1, E5, E6, E7, E25 |
| Before the build and parts have loaded (amended: a pending click waits, then decides; if the load fails it adds as today) | Behavior 4–9; E15, E16, E20–E22 |
| Unit tests for the decision; E2E: Build A, LGA1700 board, Cancel changes nothing, Add anyway adds it | Examples (levels); E1–E16, E17–E19 |
| Task: spec change to 020 (Behavior 19) and a short spec | Section 6; this file |

## 5. Out of scope

| Item | Owner |
| --- | --- |
| Asking when a raise of a drive or kit already in the build would cause an error | Not planned (D6) |
| A timeout on the pending state | Not planned (D9) |
| Blocking the build at "Add build to cart", acknowledging warnings, the server re-check | Checkout epic (#62) |
| Hints or confirmations on listing cards (they have no Add to build) and "Similar products" | Not planned |
| A confirmation on the shared-build page's "Open in builder" | Spec 022 (unchanged) |
| Fixing the issues (a "swap the board" suggestion) | Not planned |
| Mobile layout below 1024 px | Phase 2 |

## 6. Changes to earlier specs and CLAUDE.md

This spec is the source for these edits. None is made here. **Each changed spot gets a visible note, not a silent rewrite:** a line `Changed by spec 024 (#68): …` placed at the spot, next to the text it changes. The original text stays unless the note says it is replaced.

| Where | Change, and the note's text |
| --- | --- |
| Spec 020, Behavior 19 | Lead-in above the table. Note: "Changed by spec 024 (#68): when the page's fit state is "Doesn't fit your build" and the add would change the build, a confirmation comes first, and the "Replace?" dialog is not shown in that case. This table applies to everything else." |
| Spec 020, Behavior 22 | Note: "Changed by spec 024 (#68): a click before the saved build is read or its parts are loaded is pending, not ignored. It waits and then decides." |
| Spec 020, Behavior 23 and D9 | Notes at both. Behavior 23: "Changed by spec 024 (#68): the page runs the rules for the 'Fits your build' hint (spec 023), and Add to build asks first on errors." D9: "Superseded by spec 024 (#68): the rejected alternative, loading the build and confirming errors on the product page, is what happens now." |
| Spec 020, Section 8 | The row "'Fits your build' hints… on product and listing pages" gets: "Changed by spec 024 (#68): done in spec 023 (hints) and spec 024 (confirmation)." |
| Spec 020, Messages | One row: "Pending status line: Checking your build…" with the same note |
| Spec 023, Section 8 and D15 | Replace "#68 (Backlog)" with: "Changed by spec 024 (#68): done, spec 024" |
| CLAUDE.md | In the "Fits your build" paragraph, after "Add to build on a "Doesn't fit" page doesn't ask first yet (#68)": "Changed by spec 024 (#68): it asks first, with the picker's confirmation; see spec 024." The note stays in the file as the paragraph's last sentence |
| README | Only if it lists features |

No new ADR: this follows ADR 0006 (rules in the browser).

## 7. Open questions

None. The three draft questions were settled in review: the combined dialog adds one sentence (D5), raising a part already in the build doesn't ask (D6), and a click while loading waits (D7).

**Flagged against earlier specs** (settled by this spec, listed in Section 6): the product page now runs the rules before adding, which contradicts spec 020 Behavior 23 and D9 (the contradiction was already there after spec 023); and a pending click changes spec 020 Behavior 22. The PRD needs no change: FR-10 and Flow step 3 don't say what Add to build does with a misfit. The issue text for #68 still has the old fourth criterion; the mapping above records the amendment.

## 8. Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | The button label stays "Add to build" | The AC names it, the block above already shows the verdict, and E2E and the existing tests find it by that name | Relabelling it "Add anyway" as the picker does |
| D2 | The dialog depends on the same state the hint shows, "Doesn't fit", and a part "In your build" never asks | One meaning: the badge and the dialog can't disagree (spec 023 D3, D4) | Running `checkCandidate` again for in-build parts (D6) |
| D3 | A failed load adds without asking; an empty build or one with nothing comparable decides at once | The AC's failed-request case, and the hint is an extra whose failures are silent (spec 023 D11) | Blocking the add when the check can't run |
| D4 | A change that does nothing ("already", "at stock", "build full") never asks | Asking and then saying "nothing changed" is noise | Asking first, then showing the outcome |
| D5 | One dialog when both apply: the misfit dialog plus one sentence, "This also replaces the {slot noun} you picked." (review decision, was Q1) | The AC. The errors are the bigger problem, so they decide (spec 021 D5), and the same noun wording as the "Replace?" dialog keeps one voice | Two dialogs in sequence; naming the current part; a title that carries both |
| D6 | **Raising a part already in the build doesn't ask, even when the raise creates an error. This differs from the picker on purpose** (review decision, was Q2) | The AC is "a page whose badge reads Doesn't fit"; the hint reads "In your build" for such a part (spec 023 D4), so the dialog and the hint stay one story. `/builder` shows the error at once, and the shopper is raising a part they already chose. The picker asks because it judges every card by `checkCandidate` and has no hint to be consistent with. Asking here would need a second verdict beside the badge | Asking on any error, as the picker does |
| D7 | A click while the build is loading is **pending** and waits for the verdict; a failed load adds without asking (review decision, was Q3) | A shopper who clicks in the first second still gets the question, with no window where a misfit is added unasked. The wait is one request | Adding at once (the AC's first reading); disabling the button until the load ends (changes every shopper's first second) |
| D8 | The pending state also covers a click before the saved build is read | One rule, "wait for the verdict", for the whole loading period; the click is applied after the read, so it can't overwrite the saved build, and it isn't silently lost | Keeping spec 020 Behavior 22's no-op for that moment |
| D9 | No timeout on the pending state | The request is small, `no-store`, and ends with success or failure. A timeout would be a second code path for a rare case | A timer (about 10 s) that adds unasked |
| D10 | Pending feedback is a spinner on a disabled, busy button plus a "Checking your build…" line the screen reader announces | A click needs an acknowledgement, and the existing status line is already announced. It is the one new string | A silent wait; a different label on the button |
