import type { DbClient } from "@/lib/db-client"
import type { VoucherInput } from "@/lib/vouchers"

// Reading a voucher for the review and for placement (docs/specs/037-
// vouchers-at-checkout, Behavior 8, §4): fresh on every call, never cached, so
// an ended or used-up code is refused at once. `client` is `db`, or the
// transaction a placement holds.

export type VoucherRow = VoucherInput & { id: string; code: string }

// The row for a code already normalized by `normalizeVoucherCode`, or null
export async function loadVoucher(
  client: DbClient,
  code: string
): Promise<VoucherRow | null> {
  return client.voucher.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      minSpend: true,
      startsAt: true,
      endsAt: true,
      usageLimit: true,
      usedCount: true,
    },
  })
}
