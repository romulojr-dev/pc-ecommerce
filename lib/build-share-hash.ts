import { createHash } from "node:crypto"

import { type BuildItem, canonicalText } from "@/lib/builder"

// A shared build's identity (docs/specs/022-share-build, Rules › Canonical
// form, step 5): SHA-256, as 64 lowercase hex characters, of the UTF-8 bytes
// of the canonical text. Server only, and the only place a contentHash is
// made: the browser never sends one.
export function contentHashOf(items: readonly BuildItem[]): string {
  return createHash("sha256").update(canonicalText(items), "utf8").digest("hex")
}
