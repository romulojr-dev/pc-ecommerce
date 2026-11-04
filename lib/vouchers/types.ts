// The voucher fields the pure checks read (docs/specs/037-vouchers-at-checkout,
// Behavior 1). The database row has more; this is what crosses into the pure
// code, so the browser and the server run the same functions.

export type VoucherType = "FIXED" | "PERCENT"

export type VoucherInput = {
  type: VoucherType
  // Centavos for FIXED, a whole percent 1–100 for PERCENT
  value: number
  // Centavos; 0 for none
  minSpend: number
  startsAt: Date
  // null: never ends
  endsAt: Date | null
  // null: unlimited
  usageLimit: number | null
  usedCount: number
}

// Why a code was refused. `below-minimum` is decided with the total, so the
// review raises it (docs/specs/037-vouchers-at-checkout, Behavior 13); the
// others come from `checkVoucher`.
export type VoucherRefusal =
  | {
      reason: "unknown" | "not-started" | "ended" | "used-up" | "below-minimum"
    }
  | { reason: "min-spend"; shortBy: number }

export type VoucherCheck =
  | { ok: true; discount: number }
  | ({ ok: false } & Exclude<VoucherRefusal, { reason: "below-minimum" }>)
