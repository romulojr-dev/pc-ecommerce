# 022 — Share a build by link

Status: **Approved** (review changes applied) · Issue: #59 (epic #3, depends on #53 and #54, both merged) · PRD refs: PC Builder › Flow (step 5, share); Technical architecture › Data model (`Build`, `BuildItem`); Milestones (Sprint 5)

## 1. Summary

This story lets a shopper turn their build into a link. **Share build** on `/builder` stores an immutable snapshot of the build's items (slot, product, quantity) and shows `/builds/<slug>`. Anyone with the link, signed in or not, sees the build with current prices and stock and the compatibility result, and can **Open in builder** to continue from it. The same contents always give the same link, so sharing twice, or at the same moment from two browsers, makes one row. It is the app's first anonymous write and its first server action, and #62 (Add build to cart) will reuse the same table and upsert. Because it creates the first user data, it also makes the catalog reset commands refuse to run against production and proves that a normal re-seed keeps shared builds (Rules › Production safety).

## 2. Behavior

### Sharing from `/builder`

1. The summary panel gets a **Share build** button under "Add build to cart". It is enabled when the build has at least one part and its parts have loaded (the summary is in its "ready" state, spec 020 Behavior 9 and 16). Otherwise it is disabled, with visible text linked by `aria-describedby` (Messages): "Add parts to share your build." for an empty build. While the saved build or its parts are loading, or after a load error, it is disabled without a note (the summary already shows its skeleton or error).
2. Sharing is allowed whatever the build's status: a build with errors or warnings can be shared (D3), and so can one with parts that aren't buyable.
3. Clicking it opens a **dialog** (D2) and, at once, sends the saved build's items to a server action: `{ slot, productId, quantity }` entries read from the store at the moment of the click, nothing else. The client never sends a hash, a slug, names or prices.
4. **Creating:** the dialog shows "Creating your link…" (`aria-busy`), with Close available.
5. **Created:** the dialog shows the full URL in a read-only text field labelled "Share link", a **Copy link** button, and one line: "This link shows these parts. Prices and stock are always up to date." The field is built from the browser's own origin plus `/builds/<slug>` (D10), takes focus and has its text selected, so Ctrl+C works even where copy buttons don't.
6. **Copy link** copies the URL and announces "Link copied" in a `role="status"` region (also shown as text next to the button). If copying isn't possible (no clipboard permission, an insecure context), it says "Couldn't copy the link. Select it and copy it yourself." in the same region, and the field stays selected.
7. **Error:** the dialog shows what happened (Messages) in a `role="alert"` region, with **Try again** (repeats the request with the items as they are now) and **Close**. The saved build is never changed by sharing.
8. Clicking Share again on the same contents gives the same URL (Rules › Same contents, same link). Closing the dialog returns focus to the Share button. Escape closes it.
9. If the build changes in another tab while the dialog is open, the dialog still shows the link it made: a link always shows the contents it was made from, and its text says so (Behavior 5).

### The shared page `/builds/<slug>`

10. **Per request** (`await connection()`, ADR 0003): the page reads the snapshot's items and loads their parts from the database on every request, so prices, stock, specs and a part's status are current. Nothing about the snapshot is cached.
11. **Unknown slug** → the app's standard 404 page with HTTP status 404. A slug that isn't shaped like a share slug is a 404 too, without touching the database. A snapshot with no items (see D9) is also a 404. The page has no route-level loading skeleton, so the 404 keeps its status (CLAUDE.md, related products: same reason).
12. **Layout:** heading "Shared PC build" with a short intro (Messages), then the eight slots in `builderCategories` order, beside a summary panel that stays in view from 1024 px up (sticky, as on `/builder`). Read-only: no Remove, Change, quantity stepper or "Choose" buttons, and no Add build to cart (#62).
13. **Slot rows** show an available part the way `/builder` does: image (`ProductImage`), name linked to its product page, brand, the price the shopper pays (`effectivePrice`, regular price struck through when on sale), its current stock label, and an "Error" / "Warning" marker when an issue names it. A quantity above 1 shows "{unit price} × {quantity}" and the line total. An empty slot shows its category name and "No part chosen". Storage drives are listed by name, A to Z (D7).
14. **Parts that can't be bought** (active, but out of stock or a pre-order — spec 020's "buyable" rule): listed in place with their stock label and the note "Not available to buy right now." They still count in the total, the power estimate and the checks, as on `/builder` (spec 020 D19).
15. **Parts that are no longer sold** (their product is not active any more, or it is no longer a valid builder part, D4): listed in place **by name** (decided in review), with their brand and the label "No longer sold" plus the note "This part isn't sold anymore, so the total and the checks leave it out." No price, no link. They are **not** counted in the total, the power estimate or the checks (D4). Nothing is dropped silently.
16. **Incomplete builds:** when the snapshot has one or more parts that are no longer sold, a notice banner above the slots says "{n} parts are no longer sold, so the total and checks leave them out." (one: "1 part is no longer sold, so the total and checks leave it out."). The build is **incomplete, never OK**: the summary's status reads "Incomplete" (with its own icon) wherever it would have read "OK". "Warnings" and "Errors" are real findings about the remaining parts and stay as they are. The banner is page content, not a live region.
17. **Summary** (same figures and copy as `/builder`, from the same functions):
    - **Total:** Σ `effectivePrice` × quantity of the parts that are still sold, with `formatPeso`.
    - **Estimated power:** `estimateWattage` ("Estimated power: 264 W of 550 W (48%)"), with the same "How is this estimated?" tooltip.
    - **Status and issues:** `buildStatus(checkBuild(build))` as the status (with "Incomplete" taking the place of "OK", Behavior 16), every issue message, or "No compatibility issues found." A snapshot whose every part is no longer sold shows status "Incomplete" and no issues line, since nothing was checked.
    - **Availability:** one line for parts that can't be bought right now, naming the part (one) or counting them (several) (Messages). Parts that are no longer sold are covered by the banner, not a second line.
    - **Open in builder** (primary button).
18. **Metadata:** title "Shared PC build", a description, canonical `/builds/<slug>`, `noindex`, and Open Graph / Twitter tags from `socialMetadata` with the default image (D8). It is not in `sitemap.xml`.
19. **Error state:** if the database can't be read, the page shows the app's standard error page (the app has none of its own yet), never a 404.

### Open in builder

20. The button does nothing until the saved build has been read (spec 020 Behavior 22), and its label never depends on the saved build, so the server and first client render match.
21. **Same contents:** if the saved build's canonical items (Rules › Canonical form) equal the snapshot's, the button just goes to `/builder` by client navigation. No dialog, and the saved build isn't touched (D6). The comparison ignores the order of drives.
22. Otherwise, if the saved build **has parts**, a dialog asks first: "Replace your current build?" / "Opening this build replaces the {n} parts in your builder." with **Replace** and **Cancel**. Cancel closes it and changes nothing. If the saved build is empty, there is no dialog.
23. On Replace (or straight away when empty), the shared items go through `parseBuild` and then `assembleBuild` with the parts the page loaded (the ones still sold). Items whose part is gone or in the wrong slot are left out and reported as `BuildChange`s. The result replaces the saved build (after the 20-product cap), and the app goes to `/builder` by client navigation, so the in-memory notice survives.
24. **Notice on `/builder`** when something was left out: "A part from the shared build is no longer available, so we left it out: {slot}." / "Some parts from the shared build are no longer available, so we left them out: {slot}, {slot}." (slots in slot order, once each). It is dismissible and announced, like spec 020's notice.
25. Parts that are active but not buyable are **kept**, like a saved part that stops being buyable (spec 020 Behavior 13): `/builder` shows their row note and the availability line.
26. `/builder` then loads its parts as usual (spec 020 Behavior 5–8). A part that disappeared between the shared page loading and the open is dropped there with the usual notice. After a same-contents shortcut (Behavior 21), this is also where parts that are no longer sold are dropped, with spec 020's usual notice.

## 3. Examples

Prices and stock are seed values. **Build A** is spec 001's compatible build (`buildA` in `test-support/seed-parts.ts`): AMD Ryzen 5 7600, ASUS ROG Strix B650-A Gaming WiFi, Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30, Samsung 990 PRO 1TB NVMe SSD, ASUS Dual GeForce RTX 4060 OC Edition 8GB, Lian Li LANCOOL 216 Black, Cooler Master MWE 550 Bronze V2, Thermalright Peerless Assassin 120 SE, all quantity 1 (total ₱69,060.00; the RTX 4060 is ₱17,995.00, spec 020 E3 and E11). Examples that change a product's status, price or stock set it in the test database.

### Sharing (`shareBuild`)

| # | Input (items) | Expected |
| --- | --- | --- |
| E1 | Build A on empty tables | `ok` with a 10-character slug (`[a-z0-9]`). One `Build` row (a 64-character hex `contentHash`) and 8 `BuildItem` rows, each quantity 1 |
| E2 | Build A again | `ok` with the same slug. Still 1 `Build` and 8 `BuildItem` rows |
| E3 | Build A + Crucial MX500 1TB 2.5" SATA SSD, storage listed [990 PRO, MX500]; then [MX500, 990 PRO] | The same slug both times (order never matters). 1 row |
| E4 | Build A with the Vengeance kit at quantity 2 | `ok` with a different slug. Build A's link still shows Build A |
| E5 | 10 calls for Build A at the same moment, on empty tables | Every call gets the same slug. 1 `Build`, 8 `BuildItem` rows. Run again with two different builds at once: two slugs, two rows |
| E6 | Ryzen 5 7600 + MSI PRO B760M-A WiFi DDR4 (socket mismatch, spec 020 E6) | `ok`: errors don't block sharing |
| E7 | Ryzen 7 9800X3D + ASUS ROG Astral GeForce RTX 5090 OC (stock 0) + Corsair RM850e | `ok`: active but not buyable is allowed |
| E8 | Ryzen 5 7600 alone | `ok`, 1 `BuildItem` |
| E9 | `[]` | `empty`. Nothing written |
| E10 | Build A's 7 other parts + 13 different drives (20 products) | `ok` |
| E11 | The same plus a 14th drive (21 items) | `too-many-parts`. Nothing written, and no database read |
| E12 | Not a list (`null`, `{}`, a string); an item with no `productId`; slot `"monitor"`; quantity 0, −1, 1.5 or `"2"`; an empty `productId` | `invalid`. Nothing written |
| E13 | The same drive twice (two storage items with one id); two CPUs; the CPU at quantity 2 | `invalid` (`parseBuild` would repair these, the server rejects them, D5). Nothing written |
| E14 | Vengeance at quantity 99; at 100 | 99 is `ok`. 100 is `quantity-too-high` with the item's slot, product id and `max: 99`, so the dialog can say what to change: "You can share up to 99 of one part. Lower the quantity of the Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30 and try again." Nothing written |
| E15 | An item whose id no product has | `unavailable`. Nothing written |
| E16 | Build A with the RTX 4060 set to draft | `unavailable`. Nothing written |
| E17 | A storage item whose id is the Ryzen 5 7600 | `unavailable` (wrong slot). Nothing written |
| E18 | Items with an extra `contentHash: "x"` property | The extra property is ignored; the stored hash is the one the server computes |
| E19 | The database fails while writing the items | `error`. No `Build` row without its items is left behind |

### Data rules

| # | Check | Expected |
| --- | --- | --- |
| E20 | Delete a product that a `BuildItem` points to (Build A's Ryzen 5 7600) | Refused by the database (foreign key, `onDelete: Restrict`). The product and the build are unchanged |
| E21 | Delete a product no build uses | Succeeds (its images go with it, as before) |
| E22 | Insert a second `BuildItem` with the same build, slot and product | Refused (unique) |
| E23 | `pnpm db:seed --reset` and the test helper `resetCatalog()`, where allowed | `Build` and `BuildItem` are empty afterwards (D9) |

### Shared page (`/builds/<slug>`)

| # | Snapshot | Expected |
| --- | --- | --- |
| E24 | Build A | Heading "Shared PC build". Eight slot rows in order with the parts, brands, prices and "In stock". Total ₱69,060.00. "Estimated power: 264 W of 550 W (48%)". Status OK, "No compatibility issues found." No availability lines. An "Open in builder" button. No Remove, Change, stepper or cart button |
| E25 | Ryzen 5 7600 + MSI PRO B760M-A WiFi DDR4 | Status Errors with "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4." Both rows have an Error marker. The other six slots read "No part chosen" |
| E26 | Ryzen 7 9800X3D (stock 4) + RTX 5090 (stock 0) + RM850e | RTX 5090 row: "Out of stock", "Not available to buy right now." The 9800X3D row says "Low stock" with no note. Total ₱217,485.00 (the 5090 counts). "Estimated power: 958 W of 850 W (113%)", status Errors. Availability: "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB isn't available to buy right now." |
| E27 | Intel Core Ultra 7 265K (a pre-order shipping 2027-02-01) | Row "Pre-order" with the note. Total ₱20,995.00. Status OK. Availability line names the 265K |
| E28 | Build A, then the RTX 4060 is set to draft | Banner above the slots: "1 part is no longer sold, so the total and checks leave it out." GPU row: "ASUS Dual GeForce RTX 4060 OC Edition 8GB", "No longer sold", the note, no price, no link. Total ₱51,065.00. "Estimated power: 114 W of 550 W (21%)". Status **Incomplete**, not OK; "No compatibility issues found." still lists the remaining parts' result |
| E29 | Build A, then a part gets specs that fail `validateSpecs` | Treated as in E28 (no longer sold) |
| E30 | A snapshot whose only part is a draft CPU | Banner "1 part is no longer sold, so the total and checks leave it out." CPU row "No longer sold". Total ₱0.00. "Estimated power: 0 W". Status Incomplete and no issues line |
| E30a | Ryzen 5 7600 + MSI PRO B760M-A WiFi DDR4, then the MSI board is set to draft | Banner for 1 part. The Ryzen alone raises no issue, so status Incomplete (not OK). If instead the Ryzen's checks still gave a warning or error, that status would show (Behavior 16) |
| E30b | Build A, then the RTX 4060 and the 990 PRO are set to draft | Banner "2 parts are no longer sold, so the total and checks leave them out." |
| E31 | Build A shared, then the 990 PRO's price changes | Reloading the page shows the new price and total. The snapshot's items are unchanged |
| E32 | Build A with the Vengeance kit at 2 | "₱6,495.00 × 2" and the line total ₱12,990.00. Total ₱75,555.00 |
| E33 | Build A + MX500, shared with the MX500 first | Storage lists the drives by name A to Z (Crucial MX500, then Samsung 990 PRO), whatever order they were shared in |
| E34 | `/builds/zzzzzzzzzz` (well-formed, no row) | 404 |
| E35 | `/builds/..%2Fadmin`, `/builds/UPPER`, a 200-character slug | 404, with no database query |
| E36 | A `Build` row with no `BuildItem`s | 404 |
| E37 | Page metadata | `<title>` "Shared PC build", `<meta name="robots" content="noindex">`, canonical `/builds/<slug>` (absolute), `og:title`, `og:url`, the default Open Graph image |
| E38 | `sitemap.xml` | No `/builds` URL |

### Share dialog (`/builder`)

| # | State | Action | Expected |
| --- | --- | --- | --- |
| E39 | Empty build | — | Share build disabled; "Add parts to share your build." is visible and described by the button |
| E40 | Build A loaded | Share build | Dialog "Share your build". Briefly "Creating your link…", then the field `http://localhost:3000/builds/<slug>` (selected) and Copy link |
| E41 | E40 | Copy link | The clipboard holds the URL. "Link copied" is announced in a `role="status"` region |
| E42 | E40, clipboard refused | Copy link | "Couldn't copy the link. Select it and copy it yourself." The field stays selected |
| E43 | E40, close, share again | Share build | The same URL. Still one row |
| E44 | Build A, parts still loading, or the parts request failed | — | Share build disabled |
| E45 | Build A; the action fails (network or server) | Share build | `role="alert"`: "We couldn't create a link. Try again." plus Try again. The saved build is unchanged. Try again succeeds → E40 |
| E46 | Build A; the RTX 4060 became draft since the page loaded | Share build | "A part in your build is no longer available. Reload the page to update your build." |
| E47 | E40 open, another tab removes the case | — | The dialog still shows Build A's link (Behavior 9) |
| E48 | Ryzen 5 7600 + MSI B760M (errors) | Share build | Works (E6). The link's page shows the errors (E25) |

### Open in builder

| # | Saved build in this browser | Action | Expected |
| --- | --- | --- | --- |
| E49 | Empty (a fresh browser context) | Open E24's page, Open in builder | No dialog. Goes to `/builder`, which shows Build A with spec 020's E3 figures. The saved build holds the 8 items. No notice |
| E50 | Ryzen 5 7600 | Open in builder | Dialog "Replace your current build?" / "Opening this build replaces the 1 part in your builder." Replace → `/builder` shows Build A. Cancel → stays on the shared page, the saved build is still the Ryzen |
| E51 | Build A (the same contents as the link), with the drives saved in another order than the link lists them | Open in builder | No dialog. Goes straight to `/builder`; the saved build is untouched (drive order included) and no notice shows (D6) |
| E51a | Build A + MX500 saved, link holds Build A only | Open in builder | The contents differ, so the dialog appears: "…replaces the 9 parts in your builder." |
| E51b | Build A saved; link holds Build A with the RTX 4060 now draft | Open in builder | Items still equal the snapshot's, so no dialog. `/builder` loads, drops the 4060 and shows spec 020's notice ("…no longer available, so we removed it: Graphics Card.") |
| E52 | Empty; shared Build A with the RTX 4060 now draft | Open in builder | `/builder` shows 7 parts and "Choose a graphics card". Notice: "A part from the shared build is no longer available, so we left it out: Graphics Card." The saved build holds 7 items |
| E53 | Empty; shared Build A with the 4060 and the 990 PRO now draft | Open in builder | "Some parts from the shared build are no longer available, so we left them out: Storage, Graphics Card." |
| E54 | Empty; E26's snapshot | Open in builder | The RTX 5090 stays in the graphics card slot with its note, and `/builder` shows spec 020's E7 figures |
| E55 | Empty; E32's snapshot (Vengeance × 2) | Open in builder | Memory quantity 2 |
| E56 | The saved build isn't read yet (right after load) | Click Open in builder | Nothing happens; after the read it works |

### Canonical form and concurrency

Product ids here are short stand-ins (`c1`, `d1`); real ones are cuids.

| # | Input | Expected |
| --- | --- | --- |
| E57 | Items `{storage, d2, 1}`, `{cpu, c1, 1}`, `{storage, d1, 2}` | Canonical text `[["cpu","c1",1],["storage","d1",2],["storage","d2",1]]`. Hash `ee9da0e314b30c967e6461e1f2a7b4ad39ff848b921b354f4a5f7ff316a615dc` (SHA-256, lowercase hex, of those UTF-8 bytes). This pair is the unit test's fixed expectation |
| E58 | The same three items in each of the other five orders | The same canonical text and the same hash every time |
| E59 | Items `{cpu, c1, 1}`, `{case, k1, 1}` | Canonical text `[["case","k1",1],["cpu","c1",1]]`: slots sort by their name (`case` before `cpu`), not by builder order, so the hash doesn't change if the builder's slot order ever does |
| E60 | The same items with `d1` at quantity 3 instead of 2 | A different hash |
| E61 | Two shares of new contents started at the same moment | One request inserts. The other hits the unique `contentHash` (P2002), reads the existing row and returns its slug. Both get one slug. 1 `Build`, its items complete |
| E62 | New contents, but the slug generator returns a slug that another build already has | The insert fails on the unique `shareSlug` (P2002), no row has this `contentHash`, so the share retries with a new slug and succeeds. After 3 collisions in a row: `error`, nothing written |

### Production safety

| # | Check | Expected |
| --- | --- | --- |
| E63 | The reset guard with `NODE_ENV=production` | Refused: "Refusing to reset the catalog: NODE_ENV is production. A reset deletes shared builds and, later, carts and orders." |
| E64 | …with `VERCEL_ENV=production` | Refused with the same kind of message naming `VERCEL_ENV` |
| E65 | …with `DATABASE_URL` on the host named by `PRODUCTION_DATABASE_HOST` (pooled and direct URLs of one Neon branch count as one host) | Refused, naming the host |
| E66 | …for `pnpm db:seed --reset`, with `PRODUCTION_DATABASE_HOST` not set | Refused: "PRODUCTION_DATABASE_HOST is not set, so I can't tell whether this is production. Set it in .env.local." (fails closed, D16) |
| E67 | …with `NODE_ENV=development`, `VERCEL_ENV=preview` or unset, and another host | Allowed |
| E68 | `pnpm db:seed --reset` that is refused | Exit code 1, the message, nothing written (not even a `Build` row deleted). The same environment with plain `pnpm db:seed` is still allowed (the production seed procedure of spec 004) |
| E69 | `resetCatalog()` with `VERCEL_ENV=production`, or `DATABASE_URL` on the production host | Throws the same message before any statement runs. (It already throws unless `DATABASE_URL` equals `TEST_DATABASE_URL`; this adds the production checks as a second lock) |
| E70 | Build A shared; then the full seed is written twice with `reset: false` | The seed upserts by SKU and slug and never deletes: the `Build` and its 8 `BuildItem`s are unchanged, point at the same product ids, and `/builds/<slug>` still shows Build A |

## 4. Rules and edge cases

### Same contents, same link

- **Canonical form** (exact, because the hash is stored and later builds are compared with it):
  1. Take the validated items (no duplicates, so a `(slot, productId)` pair is unique).
  2. Turn each into the array `[slot, productId, quantity]`: slot as its slug string, product id as its string, quantity as a JSON integer.
  3. **Sort** by `slot`, then by `productId`. Both are compared as plain strings by UTF-16 code units (JavaScript's default `<`), never with a locale. Slot order in the builder doesn't enter into it (E59).
  4. **Serialize** the sorted list with `JSON.stringify`: no whitespace, no extra fields, e.g. `[["cpu","c1",1],["storage","d1",2],["storage","d2",1]]`.
  5. **Hash** the UTF-8 bytes of that text with **SHA-256**, written as 64 lowercase hex characters. That is `contentHash` (E57, E58).

  The canonical items (steps 1 to 3) are a pure function that the browser also uses to compare builds (Behavior 21); only the hashing happens on the server, and the server is the only place a `contentHash` is made (E18). The form is a contract: changing it would make the same contents hash differently, so a later share would create a second row for them (old links would keep working). Any such change is a new ADR.
- **Slug:** random, 10 characters from `a-z0-9`, made when the row is first created and never derived from the contents (D1).
- **Same contents → same slug**, also under concurrency: the share inserts the `Build` with its items in one transaction. If the insert fails with a unique-constraint error (Prisma `P2002`), it looks the row up by `contentHash`. **Found:** another request just created these contents, so it returns that row's slug (E61). **Not found:** the conflict was on `shareSlug`, a random collision, so it tries again with a new slug, up to 3 times in all, then answers `error` (E62). No request ever gets a slug whose row isn't committed with all its items (E5, E19, E61).
- **One transaction:** a `Build` and its `BuildItem`s are written together or not at all, so a reader never sees a snapshot with missing items.
- **Immutable:** the app has no update or delete for `Build` or `BuildItem`. Contents that change get a new row and a new slug. Old links keep showing the old contents.
- **What the snapshot holds:** items only. No names, prices, stock or specs, no user, no name. `SavedBuild` (Sprint 7) will point at these rows.

### Validating what the server receives

The action's only input is the items (E18). In this order:

1. **Shape and size:** it must be a list (else `invalid`). More than `MAX_BUILD_PRODUCTS` (20) items → `too-many-parts` before anything else is parsed or read. A canonical build has one item per product, so this is the same as "at most 20 different products" (E10, E11).
2. **Empty list** → `empty`.
3. **`parseBuild` must report no changes.** The store only ever holds canonical builds, so any repair (an invalid item, a bad slot or quantity, a merged duplicate, an extra entry in a one-part slot, a quantity forced to 1) means the input isn't what the shopper's browser holds. It is rejected as `invalid` instead of repaired, so the link never shows a different build from the one the shopper sees (D5, E12, E13).
4. **Quantity** is at least 1 (`parseBuild`) and at most **99** per entry (`MAX_SHARE_QUANTITY`, decided in review). Spec 018 sets no upper limit for the engine, and the store still doesn't; the share needs one because rows are public input and a database `Int` is finite. A quantity above 99 answers `quantity-too-high` with the item's slot, product id and the maximum, so the dialog can name the part and say what to change (E14). This check runs before any database read.
5. **Active products only:** every product id must be an active product in the item's own slot (`getBuilderParts` + `assembleBuild`). Any `not-found` or `wrong-category` → `unavailable`, nothing written (E15–E17). A product with invalid specs counts as not found there, as it does for the builder.
6. **Not required:** buyable stock, or an `ok` status (D3). Stock is current data, not part of the snapshot.

The server never trusts that the browser checked: the client runs none of these for the server's benefit.

### Reading a snapshot

- **Available** = active product, in a builder category, specs valid (the same filter as `getBuilderParts`). **No longer sold** = every other product of the snapshot. Products are never deleted (`Restrict`), so every item's product exists.
- **Counted in figures and checks:** available parts, buyable or not. **Left out:** parts no longer sold (D4). The rules only ever see valid specs (spec 018).
- **Names of parts no longer sold** are shown (decided in review): the product was public when it was shared. The loader reads only the name and brand of such a part, never its price, description or specs.
- **Incomplete:** one or more parts no longer sold makes the build incomplete (Behavior 16). The status never reads "OK" then.
- **Order of drives:** the snapshot doesn't keep the order drives were added in, so storage is listed by name, A to Z, on the shared page and in Open in builder (D7).
- **`createdAt`** isn't shown.

### The data

- **`onDelete: Restrict`** from `BuildItem` to `Product` (E20). The rule behind it: a product is retired by setting its status, never deleted, so a snapshot's parts always exist and can be listed as unavailable. This is the PRD's data-model rule, now enforced by the database. The `BuildItem` → `Build` link cascades on delete, since an item has no life without its build.
- **`TRUNCATE … CASCADE`** on `Product` empties `BuildItem` but not `Build` (nothing in `Build` points at products). `pnpm db:seed --reset` and `resetCatalog()` therefore truncate `Build` too (E23, D9). The comment in `prisma/seed/write.ts` about builds is corrected.
- **`slot`** is text, checked against the builder slots in code (ADR 0002), not a database enum. A `BuildItem`'s slot equals its product's category slug, which the share checks (rule 5).

### Production safety

This story creates the app's first user data, so it makes the commands that empty the catalog harder to point at production.

- **Reset guard.** One pure function, `assertResetAllowed(env)`, decides whether a catalog reset may run. It refuses, with a message that names the reason and says what a reset deletes (E63–E67), when:
  - `NODE_ENV` is `production`, or
  - `VERCEL_ENV` is `production`, or
  - the host of `DATABASE_URL` is the host in the new optional variable `PRODUCTION_DATABASE_HOST` (compared like `test-support/db-guard.ts` does: the pooled and direct URLs of one Neon branch are one host).
- **Where it runs.** `pnpm db:seed --reset` calls it after validating the seed and before the host line and any write (E68). For the script the guard **fails closed**: if `PRODUCTION_DATABASE_HOST` is not set, `--reset` is refused (E66, D16). Plain `pnpm db:seed` is never refused: spec 004's production seeding procedure stays valid. `resetCatalog()` in `test-support/db.ts` calls it too, as a second lock beside its existing `TEST_DATABASE_URL` check (E69); there an unset host variable doesn't refuse, because tests only run against `TEST_DATABASE_URL`, which `db-guard.ts` already keeps off the app's host.
- **Why not only `NODE_ENV` / `VERCEL_ENV`.** The production seed is run by hand from a laptop, where `VERCEL_ENV` is never set and `NODE_ENV=production` is set only if the person remembers it (spec 004). The host check is what covers a hand-run `--reset` with production URLs in the shell. `PRODUCTION_DATABASE_HOST` goes in `.env.local` and `.env.example`, and is optional for the app itself (`lib/env.ts`).
- **What a normal re-seed does to builds.** Checked in `prisma/seed/write.ts`: categories and brands are upserted by slug, products are updated in place by SKU, and nothing is deleted. A product keeps its id, so `BuildItem` rows still point at it. Removing a part from the seed data doesn't delete the product either. So a re-seed keeps `Build` and `BuildItem` rows, and no separate fix is needed. An integration test proves it (E70) and fails if a later seed change breaks it.
- **Not covered here:** other ways to empty a database (`prisma migrate reset`, the Neon console, a hand-written migration that deletes products). The `Restrict` rule makes the database refuse deleting a used product, which protects against application bugs and migrations alike, but not against `TRUNCATE`.

### Caching and safety

- `Build` data is never cached (ADR 0003, per-request data), so a write invalidates no tag. `sitemap.xml` doesn't list it.
- The share URL is `<origin>/builds/<slug>`. An unguessable slug is the only access control: anyone with the link can view, and nothing else is exposed (no user data exists in a snapshot).
- **No rate limiting here:** anyone can call the action and create rows with real product ids. #64 owns limits. The validation above bounds each request (at most 20 items, quantities up to 99).
- Playwright against a local dev server writes rows to the dev database. Builds are idempotent by contents, so the E2E build adds one row total.

### Accessibility

- The dialog is a real modal (focus in, Escape closes, focus back on Share build). The link field has an accessible name. Copy confirmation and errors are in live regions (`role="status"` / `role="alert"`).
- Shared-page rows use the same list structure and accessible names as `/builder`, minus the actions. Status, severity and stock notes always come as text plus an icon.

## 5. Messages and copy

| Where | Text |
| --- | --- |
| Share button | Share build |
| Disabled note (empty build) | Add parts to share your build. |
| Dialog title | Share your build |
| Creating | Creating your link… |
| Link field label | Share link |
| Link line | This link shows these parts. Prices and stock are always up to date. |
| Copy button | Copy link |
| Copied | Link copied |
| Copy failed | Couldn't copy the link. Select it and copy it yourself. |
| Error, generic | We couldn't create a link. Try again. |
| Error, part gone | A part in your build is no longer available. Reload the page to update your build. |
| Error, too many | Your build has too many parts to share. |
| Error, quantity too high | You can share up to 99 of one part. Lower the quantity of the {part} and try again. |
| Error buttons | Try again · Close |
| Shared page title | Shared PC build |
| Meta description | A PC build shared from PC Silicon. See the parts, the total price and whether everything fits, then open it in the PC Builder. |
| Intro under h1 | Someone shared this build with you. Prices and stock are current; the parts are the ones chosen when it was shared. |
| Empty slot | No part chosen |
| Row label, retired | No longer sold |
| Row note, not buyable | Not available to buy right now. |
| Row note, retired | This part isn't sold anymore, so the total and the checks leave it out. |
| Availability, not buyable, one | The {part} isn't available to buy right now. |
| Availability, not buyable, several | {n} parts in this build aren't available to buy right now. |
| Banner, parts no longer sold, one | 1 part is no longer sold, so the total and checks leave it out. |
| Banner, parts no longer sold, several | {n} parts are no longer sold, so the total and checks leave them out. |
| Status label, incomplete | Incomplete |
| Open button | Open in builder |
| Replace dialog title | Replace your current build? |
| Replace dialog body | Opening this build replaces the {n} parts in your builder. (one: "…replaces the 1 part in your builder.") |
| Replace dialog buttons | Replace · Cancel |
| Builder notice, one | A part from the shared build is no longer available, so we left it out: {slot}. |
| Builder notice, several | Some parts from the shared build are no longer available, so we left them out: {slot}, {slot}. |
| Reset refused, environment | Refusing to reset the catalog: {NODE_ENV or VERCEL_ENV} is production. A reset deletes shared builds and, later, carts and orders. |
| Reset refused, host | Refusing to reset the catalog: {host} is the production database (PRODUCTION_DATABASE_HOST). A reset deletes shared builds and, later, carts and orders. |
| Reset refused, host unknown (`db:seed --reset` only) | Refusing to reset the catalog: PRODUCTION_DATABASE_HOST is not set, so I can't tell whether this is production. Set it in .env.local. |

Reused unchanged from spec 020: the summary labels (Total, Estimated power, "How is this estimated?" and its tooltip, OK / Warnings / Errors, "No compatibility issues found."), stock labels, and the Error / Warning markers. `{slot}` is the category name (CPU, Graphics Card…). A 404 uses the app's standard page.

## 6. Data and interfaces

### Schema (one migration)

| Model | Fields |
| --- | --- |
| `Build` | `id` (cuid), `shareSlug` (unique), `contentHash` (unique), `createdAt`; has many `BuildItem` |
| `BuildItem` | `id`, `buildId` (→ `Build`, cascade on delete), `slot` (text), `productId` (→ `Product`, **`onDelete: Restrict`**), `quantity` (int, at least 1); unique `(buildId, slot, productId)`; index on `productId` |

No `userId` or `name` (saved builds come in Sprint 7 as `SavedBuild(userId, name, buildId)`). Prisma Client is regenerated.

### Code

| Name | What it is |
| --- | --- |
| `MAX_BUILD_PRODUCTS` | Stays in `lib/build-state/parts.ts`. It already imports no server code, and the parts route already imports it from there, so the issue's "move it" isn't needed (D11) |
| `MAX_SHARE_QUANTITY` | 99: the share's per-entry quantity limit |
| `shareBuild(items: unknown)` (server, `lib/`) | Everything in Rules › Validating, then the insert with P2002 handling. Returns `{ ok: true; slug } \| { ok: false; reason: "empty" \| "invalid" \| "too-many-parts" \| "unavailable" \| "error" } \| { ok: false; reason: "quantity-too-high"; slot; productId; max }`. Does not throw for bad input. What the integration tests call |
| Server action (the app's first) | A thin wrapper around `shareBuild`, the only way the browser writes a `Build`. Input: the items. It adds no logic |
| `canonicalItems(items)` (pure, browser-safe) | The sorted `[slot, productId, quantity]` list of Rules › Canonical form (steps 1 to 3) and its JSON text (step 4). Used for the hash and for Open in builder's same-contents check |
| `contentHashOf(items)` (server) | Step 5: SHA-256 hex of `canonicalItems` text. Unit-tested against E57–E60 without a database |
| `getSharedBuild(slug)` (server, `lib/`) | The snapshot's items with each part as available (a `BuilderPartData`) or no longer sold (id, name, brand, slot only). `null` for an unknown or empty snapshot. Reads per request |
| `sharedBuildView(...)` (pure) | From the snapshot: the assembled build of available parts, total, the status (with "Incomplete" in place of "OK", Behavior 16), the not-buyable availability line and the banner count. Reuses `checkBuild`, `buildStatus`, `estimateWattage`, `buildTotal`, `availabilityMessage` |
| `assertResetAllowed(env, { requireProductionHost })` (pure, `prisma/seed` or `lib/`) | Production safety (Rules › Production safety). Throws an error with the Messages text. Takes the environment as an argument, so it is unit-tested without a database. Shares host parsing with `test-support/db-guard.ts` |
| `PRODUCTION_DATABASE_HOST` | New optional server variable in `lib/env.ts` and `.env.example`: the host of the production database. Optional for the app; required by `pnpm db:seed --reset` |
| `sharedSlug` check (pure) | True for 10 lowercase letters and digits. Anything else is a 404 without a query |
| Build store: a "load" action | Replaces the whole saved build with given items (after `parseBuild` and the 20-product cap) and sets the shared-build notice. Like every action it is ignored before the read |
| `buildNotice` | Gains the shared-build lines (Messages) |
| `/builds/[slug]` page | Server component, `connection()`, `notFound()`, metadata. Reuses `ProductImage`, `formatPeso`, `stockStatusLabel`, `SeverityMarker`, the summary's power and status pieces |
| Share dialog, Open in builder button (client) | New components. The read-only slot row can share `PartRow`'s display parts with `/builder` |
| `lib/reserved-slugs.ts` | `builds` is already reserved; `reserved-slugs.test.ts` stays green |

### Docs

- `CLAUDE.md`: a new bullet on sharing (the tables, the canonical form, the same-contents rule, `shareBuild` and `getSharedBuild`, the retired-part and incomplete rules, `resetCatalog` / `--reset` truncating `Build`), and the `db:seed` bullet's reset rule updated: refused when `NODE_ENV` or `VERCEL_ENV` is production or the target is `PRODUCTION_DATABASE_HOST`, which must be set.
- **ADR 0007** (decided in review): snapshots are content-addressed rows. It records the canonical form and hash (and that changing it is a new ADR), the random slug, `onDelete: Restrict`, the P2002 handling, and the production-reset guard with the reason it checks the host.
- `.env.example` gets `PRODUCTION_DATABASE_HOST`. The README's seed note (and spec 004's "Seeding production") need no change: plain `pnpm db:seed` is untouched.
- The PRD already describes the model; no change.

## 7. Test plan

| Level | File (indicative) | Covers |
| --- | --- | --- |
| Unit | `canonicalItems` / `contentHashOf` tests | E3 (order), E4 and E60 (quantity changes the hash), E18, **E57–E59** (the exact text and hash, all six orders, slot name sort) |
| Unit | share input check tests | E9–E14: empty, size, shape, repairs rejected, quantity limit and its result fields, extra property |
| Unit | `sharedBuildView` tests | E24–E33, E30a, E30b: totals, power, status, "Incomplete" in place of OK only, the banner counts, not-buyable line, retired excluded, drive order |
| Unit | slug check, store "load" action, `buildNotice`, same-contents comparison | E35; E49–E55 (replace, cap, notice slots and copy); E51, E51a, E51b (equal canonical items, drive order ignored) |
| Unit | `assertResetAllowed` tests | E63–E67 and the message texts, pooled and direct URLs as one host, the host variable required or not |
| Unit (component) | share dialog | E39–E48: disabled states, creating, created, copy, copy refused, error (including the quantity message with the part's name) and Try again, live regions, focus |
| Unit (component) | shared build view, Open in builder | E24–E30b text, banner and absent controls; E49–E51b, E56 dialog, Cancel, shortcut, nothing before the read |
| Integration (Postgres) | `lib/build-share.db.test.ts` | E1–E8, E10, E15–E17, E19 (a failing write leaves nothing), **E61 two shares in parallel with `Promise.all`** (and E5 with ten), **E62 forced slug collision** (the generator is injectable), constraints E20–E22 (a raw delete is refused with a foreign-key error), E23 (`resetCatalog` empties builds) |
| Integration (Postgres) | `getSharedBuild` tests | E24–E31, E33–E36: available vs no longer sold (draft, bad specs; only name and brand read), current price and stock, unknown and empty snapshots |
| Integration (Postgres) | `prisma/seed/write.db.test.ts` | **E70**: share Build A, run `writeSeed` twice with `reset: false` on the validated seed, and check the `Build` and `BuildItem` rows and their product ids are unchanged. Also `resetCatalog()` throwing under `VERCEL_ENV=production` before touching any row (E69) |
| Script | `pnpm db:seed --reset` check | E68: run with the refused environments; exit code 1, message, no rows changed (a small test of the script's `main` or a child-process test; the plan picks) |
| E2E | `e2e/share-build.spec.ts` | **AC:** build Build A through the product pages → Share build → read the URL → open it in a fresh browser context → E24 figures → Open in builder → `/builder` matches (E49). Copy confirmation (E41, with clipboard permission). Replace dialog (E50). Unknown slug → 404 (E34). Shared page is `noindex` with a canonical and absent from `sitemap.xml` (E37, E38; fits `seo.spec.ts`). E26–E28, E52–E54 need product status or stock changes, which E2E can't make (no database access), so the component and integration rows cover them |
| Existing | `reserved-slugs.test.ts`, `e2e/test.ts` fixture | The hydration guard runs on every test |

## 8. Out of scope

| Item | Owner |
| --- | --- |
| Rate limiting for the share action | #64 |
| Add build to cart, including on the shared page; reusing the snapshot row for carts | #62 |
| Saved builds in an account (`SavedBuild`), naming a build, listing "my shared links" | Accounts epic / Sprint 7 (FR-19) |
| Unsharing, deleting or expiring a link; editing a shared build in place (it is immutable) | Not planned |
| Showing who shared a build, when, or a build name | Saved builds / not planned |
| A title, description or image that describes the build (parts, price) for link previews | Not planned (D8) |
| "Fits your build" hints | #61 |
| Any admin action that retires or deletes products (it must keep the `Restrict` rule in mind) | Admin epic |
| Guarding other ways to empty a database (`prisma migrate reset`, the Neon console, hand-written migrations) | Not planned; Neon branch protection and backups are an operations matter |
| A hand-off for the production database host in Vercel settings | Not needed: the variable is read by a manual script only |
| Mobile layout of the shared page (below 1024 px it stacks, unpolished) | Phase 2 |

## 9. Decisions

| # | Decision | Why | Rejected alternative |
| --- | --- | --- | --- |
| D1 | The slug is random, not derived from the hash | Anyone who knows a build's contents could compute a hash-derived slug and so find whether (and where) it was shared. Random slugs also keep the hash private to the server | A slug cut from the hash |
| D2 | Sharing happens in a dialog, not inline in the sticky summary | The summary is already full; a modal gives focus handling and live announcements for free; and a closed dialog cannot show a stale link | An inline link panel that has to be reset when the build changes |
| D3 | Builds with errors, warnings or parts that aren't buyable can be shared | The PRD blocks only "Add build to cart" on errors. Asking others "will this work?" is a main reason to share | Blocking shares on errors |
| D4 | On the shared page, parts that are no longer sold are listed by name but left out of the total, the power estimate and the checks. The build is **incomplete**: a banner says how many, and the status reads "Incomplete" instead of "OK" (review decision) | You can't buy them, and Open in builder drops them, so the figures match what the visitor will get. Checks run on fewer parts than the sharer chose, so an "OK" would claim more than was checked | Counting them in the checks. Dropping them without a trace (the AC forbids it). Showing "OK" with a footnote |
| D5 | The server **rejects** any input `parseBuild` would repair | The AC says malformed input is rejected, and repairing would put a different build behind the link than the shopper's browser holds. The store only emits canonical builds, so a repair means a hand-made request | Repairing silently and hashing the result |
| D6 | Open in builder asks before replacing a non-empty saved build, **unless its canonical items equal the snapshot's**; then it just navigates (review decision). This refines the AC, which asks whenever the local build isn't empty | A dialog that replaces a build with itself has nothing to decide. The sharer opening their own link is common | Asking every time (the AC's literal reading, and the first draft of this spec) |
| D7 | Drives are listed by name, A to Z, on the shared page and in Open in builder | The AC's `BuildItem` has no order column, and hashing ignores order (E3), so the added order is not recoverable | Adding a sort column (then the same contents could differ by order) |
| D8 | The preview is static: title "Shared PC build", the default image | Cheap, never stale, and the metadata needs no second query | Naming the CPU and GPU or the total in the title (the total would go stale in crawlers' caches) |
| D9 | `--reset` and `resetCatalog()` truncate `Build` explicitly, and a snapshot without items is a 404 | `TRUNCATE … CASCADE` from `Product` empties `BuildItem` but leaves `Build` rows pointing at nothing, which would answer `ok` for old hashes with an empty build | Relying on CASCADE, which the seed's own comment assumed |
| D10 | The displayed link uses `window.location.origin` | `NEXT_PUBLIC_SITE_URL` is fixed at build time and may name production on a preview, which would send preview links to a database that has no such row | `NEXT_PUBLIC_SITE_URL` (kept for canonicals and OG tags, where `noindex` and the preview header cover previews) |
| D11 | `MAX_BUILD_PRODUCTS` is not moved | The AC asks to move it "to where the server can import it". It lives in `lib/build-state/parts.ts`, which has no server code and is already imported by the parts route handler. Moving it only churns imports | Moving it to `lib/builder/limits.ts` |
| D12 | The share logic is a plain function; the server action is a thin wrapper | The integration tests can call it against the test database without a Next request, and #62 can reuse it | Logic inside the action |
| D13 | A part gone since the page loaded makes the share fail (`unavailable`) instead of sharing the rest | The link must show what the shopper sees. The builder already removes gone parts when it loads | Sharing the build without the missing part |
| D14 | The shared page has no route-level `loading.tsx` | A skeleton streams a 200 before `notFound()` can answer 404; the AC requires a 404 | `loading.tsx` with a skeleton |
| D15 | Open in builder assembles on the shared page with the parts it already loaded, then `/builder` re-checks | Follows the AC (`parseBuild` + `assembleBuild`, changes reported) and gives the notice its own wording. The builder's normal load still catches a race (Behavior 26) | Writing every id and letting `/builder` drop the gone ones with the "saved build" wording |
| D16 | The reset guard checks `NODE_ENV`, `VERCEL_ENV` **and** the database host, and `db:seed --reset` fails closed when `PRODUCTION_DATABASE_HOST` is unset (review item 1). It adds one optional variable | The production seed is run by hand, where `VERCEL_ENV` is never set and `NODE_ENV=production` is only a habit (spec 004). Only a host check stops a hand-run `--reset` with production URLs in the shell. `--reset` is rare and CI doesn't use it, so failing closed costs one line in `.env.local` | Checking only the two environment variables. Treating an unset host as "not production" |
| D17 | Canonical items sort by slot **name**, then product id, as plain strings (review item 5) | The hash is stored for good. Sorting by the builder's slot order would change every hash if a category were ever added or reordered | Sorting by `SLOTS` order |
| D18 | "Incomplete" displaces only "OK"; "Warnings" and "Errors" still show | They are real findings about the remaining parts. Hiding them behind "Incomplete" would lose information | Always "Incomplete" when a part is retired |
| D19 | The quantity limit has its own result (`quantity-too-high` with slot, product id and max) instead of `invalid` (review item 2) | The shopper can fix it, and the message can name the part and the number | One generic `invalid` |
| D20 | No separate issue for seeding: the non-reset seed never deletes (review item 1) | Verified in `prisma/seed/write.ts`: upserts by slug and SKU, in place. A test (E70) keeps it true | A Sprint 5 fix issue |

## 10. Open questions

None. The first draft's three questions were settled in review: the quantity limit is 99 per entry for sharing (D19), parts no longer sold show by name, and ADR 0007 is written with this story (Docs).

## Acceptance criteria mapping

This is a full-form spec. Three criteria are read differently from the issue: "move the constant" is not needed (D11); "malformed input is rejected" means anything `parseBuild` would repair is rejected too (D5); and "asks before replacing" skips the question when the contents are equal (D6, review). The 99 quantity limit (D19) and the production-safety work (D16, D20) are not in the issue; they came from review.

| Acceptance criterion | Covered by |
| --- | --- |
| Migration adds `Build` and `BuildItem` (unique slug, unique hash, unique build + slot + product), no `userId` or `name` | Section 6 › Schema; Rules › The data; E1, E22 |
| `BuildItem → Product` is `Restrict`; the spec states the rule | Rules › The data; E20, E21 |
| A shared build is an immutable snapshot of items only; prices, stock and specs are current | Rules › Same contents, same link (Immutable, What the snapshot holds); Behavior 10; E4, E31 |
| Share calls a server action with items only; server runs `parseBuild`, checks active products, hashes canonical items; same contents → same slug; concurrent → one row; client never sends the hash | Behavior 3; Rules › Same contents, same link and › Validating; E1–E3, E5, E13, E15–E18 |
| At most 20 different products, checked on the server, constant importable by the server; an empty build can't be shared | Rules › Validating (1, 2); Behavior 1; E9–E11, E39; D11 |
| Share shows the URL with a Copy button and a confirmation that screen readers announce | Behavior 4–8; Accessibility; E40–E43, E45 |
| `/builds/[slug]` per request; read-only summary (parts by slot, total, wattage, status and issues, availability); no longer active or buyable parts listed as unavailable; unknown slug → 404 | Behavior 10–17, 19; Rules › Reading a snapshot; E24–E36, E30a, E30b; D4, D14, D18 |
| Own canonical, `noindex`, Open Graph via `socialMetadata`; not in the sitemap | Behavior 17; E37, E38; D8 |
| Open in builder loads items through `parseBuild` + `assembleBuild`, reports `BuildChange`s, asks before replacing a non-empty build, then goes to `/builder` | Behavior 20–26; E49–E56, E51a, E51b; D6, D15 |
| Integration tests: same slug (also concurrent), cap, malformed input, product delete refused. E2E: share Build A → fresh context → Open in builder → builds match | Section 7 (Integration and E2E rows); E2, E5, E61, E10, E11, E12, E20, E49 |
| *(Review)* Reset commands refuse production; a re-seed keeps builds | Rules › Production safety; E63–E70; D16, D20 |
| *(Review)* Exact canonical form; reordered items give the same hash | Rules › Canonical form; E3, E57–E60; D17 |
| *(Review)* Unique-constraint conflict reads the existing row | Rules › Same contents, same link; E61, E62 |
