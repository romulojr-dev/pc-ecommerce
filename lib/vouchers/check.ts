import { voucherDiscount } from "./discount"
import type { VoucherCheck, VoucherInput } from "./types"

// Can this voucher be used on this subtotal, now, and for how much
// (docs/specs/037-vouchers-at-checkout, Behavior 8). `voucher` is null when no
// code matched. The first failure wins, in this order: unknown, not started,
// ended, used up, min spend. `startsAt` itself is allowed and `endsAt` itself
// is not. `subtotal` is the merchandise total before the discount. Pure.
export function checkVoucher(
  voucher: VoucherInput | null,
  subtotal: number,
  now: Date
): VoucherCheck {
  if (!voucher) return { ok: false, reason: "unknown" }
  if (now.getTime() < voucher.startsAt.getTime()) {
    return { ok: false, reason: "not-started" }
  }
  if (voucher.endsAt && now.getTime() >= voucher.endsAt.getTime()) {
    return { ok: false, reason: "ended" }
  }
  if (voucher.usageLimit !== null && voucher.usedCount >= voucher.usageLimit) {
    return { ok: false, reason: "used-up" }
  }
  if (subtotal < voucher.minSpend) {
    return {
      ok: false,
      reason: "min-spend",
      shortBy: voucher.minSpend - subtotal,
    }
  }
  return { ok: true, discount: voucherDiscount(voucher, subtotal) }
}
