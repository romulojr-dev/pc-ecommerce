import { createHash } from "node:crypto"

// Who an email counts against for the per-recipient cap (docs/specs/035-email-
// foundation-signed-links, §4 Recipient normalization). Node only.
//
// The address is trimmed, lower-cased and, in its local part (the text before
// the last "@"), cut at the first "+", so `ana+promo@…` and `ana@…` are one
// recipient. Dots, digits and the domain are never changed. A local part the
// cut would empty is kept as it was. The email itself is always sent to the
// address as the order stores it; this is only for the cap.
export function normalizeRecipient(address: string): string {
  const trimmed = address.trim().toLowerCase()
  const at = trimmed.lastIndexOf("@")
  if (at < 1) return trimmed
  const local = trimmed.slice(0, at)
  const plus = local.indexOf("+")
  if (plus < 1) return trimmed
  return `${local.slice(0, plus)}${trimmed.slice(at)}`
}

// What the outbox stores in place of the address
export function recipientHash(address: string): string {
  return createHash("sha256")
    .update(normalizeRecipient(address), "utf8")
    .digest("hex")
}
