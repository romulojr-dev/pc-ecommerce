import { normalizeVoucherCode } from "@/lib/vouchers"

import type { VoucherSeed } from "./data/vouchers"

// Checks the voucher seed before anything is written (docs/specs/037-vouchers-
// at-checkout, D1–D2): the database refuses the same mistakes, but a seed that
// fails halfway is worse than one that stops at the door. Returns the
// problems; an empty list means the seed is valid.
export function validateVoucherSeed(seed: readonly VoucherSeed[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const voucher of seed) {
    const fail = (message: string) =>
      errors.push(`Voucher seed ${voucher.code}: ${message}`)

    if (normalizeVoucherCode(voucher.code) !== voucher.code) {
      fail("the code must be 3 to 32 upper-case letters, digits, _ or -.")
    }
    if (seen.has(voucher.code)) fail("the code appears twice.")
    seen.add(voucher.code)

    if (voucher.type === "PERCENT") {
      if (!(
        Number.isInteger(voucher.value) &&
        voucher.value >= 1 &&
        voucher.value <= 100
      )) {
        fail("a percent must be a whole number from 1 to 100.")
      }
    } else if (!(Number.isInteger(voucher.value) && voucher.value > 0)) {
      fail("a fixed amount must be a whole number of centavos above 0.")
    }
    if (!(Number.isInteger(voucher.minSpend) && voucher.minSpend >= 0)) {
      fail("the minimum spend must be a whole number of centavos, 0 or more.")
    }
    if (
      voucher.usageLimit !== null &&
      !(Number.isInteger(voucher.usageLimit) && voucher.usageLimit >= 1)
    ) {
      fail("the usage limit must be null or a whole number, 1 or more.")
    }

    const starts = Date.parse(voucher.startsAt)
    const ends = voucher.endsAt === null ? null : Date.parse(voucher.endsAt)
    if (Number.isNaN(starts)) fail("the start is not a date.")
    if (ends !== null && Number.isNaN(ends)) fail("the end is not a date.")
    if (ends !== null && !Number.isNaN(starts) && !(ends > starts)) {
      fail("the end must be after the start.")
    }
  }

  return errors
}
