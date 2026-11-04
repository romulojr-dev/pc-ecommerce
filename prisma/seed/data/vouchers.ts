// DEMO VALUES. These codes exist so the checkout has something to try
// (docs/specs/037-vouchers-at-checkout, Behavior 2). `pnpm db:seed` inserts each
// only when its code is missing and never changes a row that exists, so what
// Admin edits later (and every usedCount) is kept. They are listed in the
// README for demo reviewers, not in the app.

export type VoucherSeed = {
  // Upper-case, 3 to 32 of A-Z 0-9 _ -
  code: string
  type: "FIXED" | "PERCENT"
  // Centavos for FIXED, a whole percent 1–100 for PERCENT
  value: number
  // Centavos; 0 for none
  minSpend: number
  // ISO instants (Manila midnights)
  startsAt: string
  // null: never ends
  endsAt: string | null
  // null: unlimited
  usageLimit: number | null
}

const STARTS = "2026-01-01T00:00:00+08:00"

export const voucherSeed: VoucherSeed[] = [
  {
    // 10 % off, from ₱5,000.00
    code: "WELCOME10",
    type: "PERCENT",
    value: 10,
    minSpend: 500_000,
    startsAt: STARTS,
    endsAt: null,
    usageLimit: null,
  },
  {
    // ₱500.00 off, from ₱10,000.00
    code: "SAVE500",
    type: "FIXED",
    value: 50_000,
    minSpend: 1_000_000,
    startsAt: STARTS,
    endsAt: null,
    usageLimit: null,
  },
  {
    // ₱5,000.00 off a build of ₱50,000.00 or more, the first 100 uses
    code: "BUILD5000",
    type: "FIXED",
    value: 500_000,
    minSpend: 5_000_000,
    startsAt: STARTS,
    endsAt: null,
    usageLimit: 100,
  },
]
