// Prices typed in pesos, stored as integer centavos (docs/specs/045-admin-
// products-create-edit, B19, B20, R5). Pure.
//
// The text is read digit by digit: no float, and no number parser, ever
// touches it (money.test.ts reads this file to prove it). A float would turn
// "1.005" or "19.99" into something that is not exactly what was typed.

export const MIN_PRICE_CENTAVOS = 1
// PHP 5,000,000.00: fits Postgres int with margin (D6)
export const MAX_PRICE_CENTAVOS = 500_000_000

export type PesoParse =
  { ok: true; centavos: number } | { ok: false; reason: "format" | "range" }

// "1299", "1,299", "1,299.5", "1,299.50": digits, commas only as thousands
// separators in groups of three, and at most two decimals
const PESO_TEXT = /^(\d+|\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/

const ZERO = 48

function digitsToInteger(digits: string): number {
  let value = 0
  for (let index = 0; index < digits.length; index++) {
    value = value * 10 + (digits.charCodeAt(index) - ZERO)
  }
  return value
}

export function pesosToCentavos(text: string): PesoParse {
  const match = PESO_TEXT.exec(text.trim())
  if (!match) return { ok: false, reason: "format" }
  const pesos = match[1].replaceAll(",", "").replace(/^0+(?=\d)/, "")
  // More than 9 digits of pesos is far past the cap; stop before any sum
  if (pesos.length > 9) return { ok: false, reason: "range" }
  const centavoDigits = (match[2] ?? "").padEnd(2, "0")
  const centavos = digitsToInteger(pesos) * 100 + digitsToInteger(centavoDigits)
  if (centavos < MIN_PRICE_CENTAVOS || centavos > MAX_PRICE_CENTAVOS) {
    return { ok: false, reason: "range" }
  }
  return { ok: true, centavos }
}

// 129950 -> "1299.50": the form's starting text (the parser reads it back)
export function centavosToPesos(centavos: number): string {
  const whole = Math.floor(centavos / 100)
  const rest = centavos - whole * 100
  return `${whole}.${rest < 10 ? "0" : ""}${rest}`
}
