import sharp from "sharp"
import { describe, expect, test } from "vitest"

import { detectImageType } from "./rules"
import { MAX_LONG_SIDE, reencodeImage } from "./reencode"

const solid = (width: number, height: number, background = "teal") =>
  sharp({ create: { width, height, channels: 3, background } })

async function ok(input: Uint8Array) {
  const result = await reencodeImage(input)
  if (typeof result === "string") throw new Error(`refused: ${result}`)
  return result
}

describe("reencodeImage", () => {
  test("E1: any accepted type comes out as WebP", async () => {
    for (const buffer of [
      await solid(100, 80).jpeg().toBuffer(),
      await solid(100, 80).png().toBuffer(),
      await solid(100, 80).webp().toBuffer(),
    ]) {
      const out = await ok(buffer)
      expect(detectImageType(out.bytes)).toBe("webp")
    }
  })

  test("E46: 3000 × 2000 shrinks to 2000 × 1333", async () => {
    const out = await ok(await solid(3000, 2000).jpeg().toBuffer())
    expect(out.width).toBe(2000)
    expect(out.height).toBe(1333)
    const meta = await sharp(out.bytes).metadata()
    expect([meta.width, meta.height]).toEqual([2000, 1333])
  })

  test("a tall photo is limited on its long side too", async () => {
    const out = await ok(await solid(1000, 4000).png().toBuffer())
    expect([out.width, out.height]).toEqual([500, MAX_LONG_SIDE])
  })

  test("E47: a small image is never enlarged", async () => {
    const out = await ok(await solid(800, 600).png().toBuffer())
    expect([out.width, out.height]).toEqual([800, 600])
  })

  test("E48: the orientation is applied and no metadata is kept", async () => {
    // 200 wide × 100 high, tagged "rotate 90° clockwise" (orientation 6),
    // with an EXIF block and a comment-like IPTC/XMP-free payload
    const tagged = await solid(200, 100)
      .withExif({
        IFD0: { Copyright: "Owner's house", ImageDescription: "GPS home" },
      })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()
    const before = await sharp(tagged).metadata()
    expect(before.orientation).toBe(6)
    expect(before.exif).toBeDefined()

    const out = await ok(tagged)
    // Upright: the 200 × 100 landscape becomes 100 × 200
    expect([out.width, out.height]).toEqual([100, 200])
    const after = await sharp(out.bytes).metadata()
    expect(after.exif).toBeUndefined()
    expect(after.icc).toBeUndefined()
    expect(after.xmp).toBeUndefined()
    expect(after.orientation).toBeUndefined()
    // None of the text survived in the bytes either
    const text = Buffer.from(out.bytes).toString("latin1")
    expect(text).not.toContain("Owner's house")
    expect(text).not.toContain("GPS home")
  })

  test("E49: more than 40 megapixels is refused before decoding", async () => {
    // 8000 × 6000 = 48 MP, and a few hundred KB as a PNG of one colour
    const big = await solid(8000, 6000, "white")
      .png({ compressionLevel: 9 })
      .toBuffer()
    expect(big.length).toBeLessThan(4 * 1024 * 1024)
    expect(await reencodeImage(big)).toBe("too-many-pixels")
  })

  test("exactly the limit is allowed", async () => {
    // 8000 × 5000 = 40,000,000
    const edge = await solid(8000, 5000, "white")
      .png({ compressionLevel: 9 })
      .toBuffer()
    const out = await ok(edge)
    expect(out.width).toBe(2000)
  })

  test("E50: bytes that start like a JPEG but aren't one are unreadable", async () => {
    const garbage = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])
    expect(await reencodeImage(garbage)).toBe("unreadable")
  })

  test("E50: a truncated real photo is unreadable", async () => {
    const real = await solid(400, 300).png().toBuffer()
    const cut = real.subarray(0, Math.floor(real.length / 2))
    expect(await reencodeImage(cut)).toBe("unreadable")
  })

  test("E51: an animated WebP keeps only its first frame", async () => {
    const frame = (color: string) => solid(40, 30, color).png().toBuffer()
    const frames = await Promise.all([
      frame("red"),
      frame("green"),
      frame("blue"),
    ])
    const animated = await sharp(frames, { join: { animated: true } })
      .webp({ loop: 0, delay: [100, 100, 100] })
      .toBuffer()
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(3)

    const out = await ok(animated)
    const meta = await sharp(out.bytes, { animated: true }).metadata()
    expect(meta.pages ?? 1).toBe(1)
    expect([out.width, out.height]).toEqual([40, 30])
    // The first frame (red), not a later one
    const { data } = await sharp(out.bytes)
      .raw()
      .toBuffer({ resolveWithObject: true })
    expect(data[0]).toBeGreaterThan(200) // R
    expect(data[1]).toBeLessThan(60) // G
  })
})
