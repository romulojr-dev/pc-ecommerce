// The upload rules that need no outside service (docs/specs/049-product-
// images-upload, R2–R4, R7). Pure: web standards only, so a test can run them
// with no database and the browser can reuse the limits.

// 4 MB, under Vercel's 4.5 MB request limit (R3)
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
// At most this many real photos a product can hold (R4, D4)
export const MAX_IMAGES_PER_PRODUCT = 8
export const MAX_ALT_LENGTH = 200

export type DetectedImageType = "jpeg" | "png" | "webp"

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const startsWith = (bytes: Uint8Array, at: number, expected: number[]) =>
  bytes.length >= at + expected.length &&
  expected.every((value, i) => bytes[at + i] === value)

// The type, from the file's first bytes only: the declared type and the
// filename are not trusted (R2). SVG, GIF and anything else is null.
export function detectImageType(bytes: Uint8Array): DetectedImageType | null {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "jpeg"
  if (startsWith(bytes, 0, PNG)) return "png"
  // "RIFF" ???? "WEBP"
  if (
    startsWith(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "webp"
  }
  return null
}

// Reads a request body but never more than maxBytes + 1: a body longer than
// the cap (whatever its header said) is cut off and reported, so a streamed
// 5 GB body can't be held in memory (R1, E11).
export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<Uint8Array | "too-large"> {
  if (!body) return new Uint8Array(0)
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        return "too-large"
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

// Content-Length as a whole number of bytes, or null when it is missing or not
// one (the route answers 411 for null, 413 for more than the cap)
export function declaredLength(header: string | null): number | null {
  if (header === null || !/^\d{1,12}$/.test(header)) return null
  return Number(header)
}

export type AltResult =
  { ok: true; value: string } | { ok: false; error: "empty" | "too-long" }

// Alt text: trimmed, 1 to 200 characters (R7)
export function validateAlt(raw: string): AltResult {
  const value = raw.trim()
  if (value === "") return { ok: false, error: "empty" }
  if (value.length > MAX_ALT_LENGTH) return { ok: false, error: "too-long" }
  return { ok: true, value }
}

// How many more photos a product can take
export const roomFor = (current: number): number =>
  Math.max(0, MAX_IMAGES_PER_PRODUCT - current)
