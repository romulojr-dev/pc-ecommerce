// Which store a stored photo URL belongs to (docs/specs/049-product-images-
// upload, R6, D16). Pure.
//
// A file is deleted only from THIS environment's own store, so a preview whose
// database was branched from production can never delete production's files.

export const FAKE_IMAGE_PATH = "/test-images/"

export type StoredUrl =
  // On this environment's Blob store: may be deleted
  | { kind: "own-blob" }
  // On some other host (production's store seen from a preview, or anything
  // that isn't a store at all): never deleted
  | { kind: "other"; host: string }
  // A file in the fake store: its name in FakeStoredImage
  | { kind: "fake"; name: string }

export function classifyStoredUrl(
  url: string,
  ownBlobHost: string | null
): StoredUrl {
  if (url.startsWith(FAKE_IMAGE_PATH)) {
    const name = url.slice(FAKE_IMAGE_PATH.length)
    // A name is one path segment: no slash, no query
    if (/^[A-Za-z0-9_.-]+$/.test(name)) return { kind: "fake", name }
    return { kind: "other", host: "invalid" }
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { kind: "other", host: "invalid" }
  }
  if (
    parsed.protocol === "https:" &&
    ownBlobHost !== null &&
    parsed.host === ownBlobHost
  ) {
    return { kind: "own-blob" }
  }
  return { kind: "other", host: parsed.host || "invalid" }
}
