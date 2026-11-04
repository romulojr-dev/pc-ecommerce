import type { VoucherInput } from "./types"

// The discount a voucher gives on a subtotal (docs/specs/037-vouchers-at-
// checkout, Behavior 10). Whole centavos, integer arithmetic only. Pure.
//
// Percent: floor(subtotal × value / 100), worked out as
// q × value + floor(r × value / 100) with subtotal = q × 100 + r, which is the
// same number without ever forming the large product. Fixed: the value,
// capped at the subtotal. A non-integer or out-of-range input is a bug in the
// caller and throws.
export function voucherDiscount(
  voucher: Pick<VoucherInput, "type" | "value">,
  subtotal: number
): number {
  const { type, value } = voucher
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
    throw new RangeError(`Invalid subtotal: ${subtotal}`)
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`Invalid voucher value: ${value}`)
  }
  if (type === "FIXED") return Math.min(value, subtotal)
  if (value > 100) throw new RangeError(`Invalid percent: ${value}`)
  const remainder = subtotal % 100
  const whole = (subtotal - remainder) / 100
  return whole * value + Math.floor((remainder * value) / 100)
}
