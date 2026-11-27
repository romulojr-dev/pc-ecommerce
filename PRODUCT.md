# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the portfolio reviewer.** A recruiter, hiring engineer or capstone reviewer who opens the live site and walks browse → build → checkout → "paid" in under 5 minutes without guidance (the PRD's first success metric). When design trade-offs conflict, demo-ability, legibility of the product's mechanism and craft win first.

The reviewer evaluates the store through its in-world personas, which still drive requirements ([docs/prd.md](docs/prd.md), "Target users"):

- **First-time builder:** student or young professional, ₱25k–60k budget, unsure what fits; needs confidence that parts work together and plain-language guidance.
- **Enthusiast / upgrader:** knows specs, buying one or two parts; needs fast spec filtering, price and stock visibility.
- **Gift / office buyer:** buying for someone else; needs simple guest checkout, trusted payment, clear warranty.
- **Shop admin:** owner, staff, or the read-only demo account; updates prices and stock, processes orders, sees what sells.

## Product Purpose

PC Silicon is a Philippine online store for PC parts that should look and behave like a real store, with real payment flows in gateway sandbox mode. It takes no live money and ships no real orders. Success is measured in demo-ability and engineering quality, not revenue: a reviewer completes the buy flow unaided, zero incompatible builds pass server validation, Lighthouse desktop ≥ 90 on key pages, and no critical accessibility violations.

## Positioning

A guided PC Builder that **blocks incompatible parts before checkout** and explains *why* in plain language ("This CPU needs an AM5 board; you picked LGA1700"). Most local shop sites are catalogs; few explain conflicts. The same compatibility engine runs in the browser and on the server, and its verdicts surface everywhere a part appears ("Fits your build" badges on listings and product pages).

## Operating Context

- Philippine shopping: prices in pesos (₱, integer centavos), GCash, Maya, cards and cash on delivery / pay on pickup; delivery fees by zone and weight; PSA PSGC addresses (region → province → city → barangay); free store pickup.
- Guest checkout only in the MVP; order access is by a private link (access token or signed email link). Customer accounts are Phase 2.
- Admin is used by Owner, Staff and a shared, read-only Demo account whose password is public on `/admin/login` so reviewers can explore it; Demo sees masked customer data.
- Every payment and email is test-mode and labeled so ("[Demo]" subjects, test-mode banner).

## Capabilities and Constraints

- Built: catalog of the 8 builder categories (~150 seeded real-world parts), keyword search and generated spec filters, product pages, PC Builder with slot picker, wattage estimate and share-by-link, cart with single items and whole builds, 3-step checkout, vouchers, Xendit sandbox payments with webhooks, COD, auto-release of unpaid orders, transactional emails, and Admin (dashboard, products, inventory, orders with fulfillment and cancel, customers, audit log).
- **Desktop-first:** designed for 1280 px and up, fully usable down to 1024 px. Mobile layouts (360 px+) are the first Phase 2 item; layouts must use responsive building blocks so mobile needs no rewrite.
- Builder compatibility feedback under 100 ms; server-rendered, SEO-ready catalog pages.
- Stack is fixed by the codebase: Next.js 16 App Router, shadcn/ui (`base-mira`, Base UI primitives), Tailwind v4, lucide icons, Geist fonts (see CLAUDE.md).
- Phase 2 and later (not in the MVP, don't design as if present): customer accounts, non-builder categories and mega-menu, compare, prebuilt templates, installments/BNPL UI, reviews, mobile layouts.
- Terminology: "build", "slot", "Fits your build", "Doesn't fit your build", "Pending payment", "COD confirmed", "Due for release".

## Brand Commitments

- Name: **PC Silicon**. No logo exists yet.
- **Monochrome across the whole product (storefront and Admin): black and white only, no accent colors.** Status colors are allowed only where they carry meaning (errors, warnings, stock and fit states).
- Copy is **English only**, in a Philippine context; plain-language, specific, never vague (compatibility messages name the parts and the values).
- Must never imitate a real retailer's branding; the store, its address and demo values are fictional.

## Evidence on Hand

- Real-world part names and specs in the seed catalog (`prisma/seed/data/`); product images are category placeholders (`public/images/placeholders/`) until real images are uploaded.
- Default link-preview image `public/images/og-default.png`.
- No testimonials, reviews, customer counts, ratings, press or registration badges exist. Do not fabricate them; trust signals must stay truthful (sandbox payments, demo store).

## Product Principles

1. **Make the mechanism visible.** Compatibility is the product; its verdicts and their reasons should be legible wherever a part appears.
2. **Explain, don't just block.** Every refusal names what conflicts and why, in plain English.
3. **Demo honestly.** It must feel like a real store while never hiding that payments and orders are test-mode.
4. **Fresh truth over stored copies.** Prices, stock and fit are always current; the UI never implies a reservation or a price it can't honor.
5. **Craft is the proof.** For the reviewer, precision in details is the evidence of engineering quality.

## Accessibility & Inclusion

WCAG 2.1 AA: keyboard navigation, visible focus states, alt text, color contrast. Since the brand is monochrome, states must never rely on color alone (fit badges use text plus icon). No critical axe violations on key pages.
