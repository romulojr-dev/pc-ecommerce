// Philippine mobile numbers (docs/specs/029-checkout-steps, §4 Inputs, D5).
// Pure: the form and the server share it.

// Spaces, dashes, dots and parentheses are ignored. Accepted: 09 + 9 digits,
// 9 + 9 digits, 639 + 9 digits, +639 + 9 digits. The result is always
// +639XXXXXXXXX. Landlines and foreign numbers give null.
export function normalizeMobile(text: string): string | null {
  const digits = text.replace(/[\s\-.()]/g, "")
  const match = /^(?:\+?63|0)?(9\d{9})$/.exec(digits)
  return match ? `+63${match[1]}` : null
}
