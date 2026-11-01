// Amounts across the gateway boundary (docs/specs/031-pay-with-xendit, §4
// Amounts, S3–S3b). The store counts integer centavos everywhere; Xendit's
// `amount` is a JSON number in pesos. Both directions go through decimal text
// built from integer digits, so no floating-point division or rounding ever
// touches a price. Pure.

// A double holds any decimal text of up to 15 significant digits exactly
// (it prints back the same), so amounts stop there: ₱9,999,999,999,999.99,
// far above any gateway's limit (Xendit cards: ₱700,000)
export const MAX_CENTAVOS = 999_999_999_999_999

// Centavos → the number sent: 1999 → 19.99, 6906000 → 69060, 10 → 0.1.
// The pesos part is (c − c % 100) / 100, an exact division of a multiple of
// 100; the text is parsed once, so the number is the double nearest that
// text and JSON.stringify prints the same text back.
export function toProviderAmount(centavos: number): number {
  if (!Number.isInteger(centavos) || centavos <= 0 || centavos > MAX_CENTAVOS) {
    throw new RangeError("amount must be a positive whole number of centavos")
  }
  const cents = centavos % 100
  const pesos = (centavos - cents) / 100
  if (cents === 0) return Number(String(pesos))
  const fraction = String(cents).padStart(2, "0").replace(/0$/, "")
  return Number(`${pesos}.${fraction}`)
}

// The number received → centavos, or null when it isn't a non-negative peso
// amount with at most two decimals and at most MAX_CENTAVOS. Never rounds:
// 19.999 is refused, not read as 2000.
export function fromProviderAmount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
  if (!match) return null
  const centavos =
    Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"))
  return centavos <= MAX_CENTAVOS ? centavos : null
}
