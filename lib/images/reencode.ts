import "server-only"

// Re-encoding every upload (docs/specs/049-product-images-upload, R19, D15).
// What is stored is never the owner's file: it is decoded, turned upright,
// shrunk to fit 2000 px, stripped of all metadata (phone photos carry GPS) and
// written as WebP. That also keeps a catalog's worth of photos inside Hobby's
// 1 GB (ADR 0013).

// About 40 megapixels: refused from the header, before the pixels are decoded
export const MAX_INPUT_PIXELS = 40_000_000
export const MAX_LONG_SIDE = 2000
export const WEBP_QUALITY = 80

export type Reencoded = { bytes: Uint8Array; width: number; height: number }

// sharp loads on first use, so a page or a test that never uploads doesn't
// need its native binary
export async function reencodeImage(
  input: Uint8Array
): Promise<Reencoded | "too-many-pixels" | "unreadable"> {
  try {
    const { default: sharp } = await import("sharp")
    // sharp reads only the first frame of an animated file unless asked
    // otherwise: that frame is the stored photo (D15). The pixel limit throws
    // from the header, before the pixels are decoded.
    const { data, info } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      // Applies the EXIF orientation. No withMetadata(): sharp then drops
      // EXIF, XMP, ICC and everything else.
      .rotate()
      .resize({
        width: MAX_LONG_SIDE,
        height: MAX_LONG_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
    return {
      bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    return error instanceof Error && /pixel limit/i.test(error.message)
      ? "too-many-pixels"
      : "unreadable"
  }
}
