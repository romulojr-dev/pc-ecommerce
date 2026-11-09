// Photo storage logging (docs/specs/049-product-images-upload, §5 Logs): one
// JSON line with an event name and a short code, the stored path or the
// foreign host. Never a token, a request body or the owner's filename.

export type ImageLogFields = {
  event: "image.upload" | "image.delete_failed" | "image.delete_skipped"
  outcome?: string
  productId?: string
  // The stored path (/products/x.webp) or, for a skip, the foreign host
  path?: string
  host?: string
  code?: string
}

export function logImageEvent(fields: ImageLogFields): void {
  const line = JSON.stringify(fields)
  if (fields.event === "image.delete_failed") console.error(line)
  else console.info(line)
}
