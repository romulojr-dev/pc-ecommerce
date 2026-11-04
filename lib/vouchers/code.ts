// A voucher code as the shopper typed it (docs/specs/037-vouchers-at-checkout,
// Behavior 9, D8). Trimmed and matched case-insensitively; the stored form is
// upper-case. The shape is tested on the typed text, before upper-casing, so a
// character that changes under case folding (ß, a dotless ı, a ligature) can
// never match a code. Pure.

const SHAPE = /^[A-Za-z0-9_-]{3,32}$/

// The upper-case code to look up, or null when the text is empty or can't be
// a code (no lookup then)
export function normalizeVoucherCode(text: string): string | null {
  const trimmed = text.trim()
  return SHAPE.test(trimmed) ? trimmed.toUpperCase() : null
}
