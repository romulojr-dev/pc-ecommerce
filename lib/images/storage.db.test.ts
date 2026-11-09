import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import { fakeStorage, imageStorage } from "./storage"

// The fake photo store (docs/specs/049-product-images-upload, R14, E44)

beforeEach(resetCatalog)
afterAll(() => db.$disconnect())

describe("fakeStorage", () => {
  it("E44: put keeps the bytes and answers a /test-images/ URL", async () => {
    const result = await fakeStorage.put(
      "abc.webp",
      new Uint8Array([9, 8, 7]),
      "image/webp"
    )
    expect(result).toEqual({ ok: true, url: "/test-images/abc.webp" })
    const row = await db.fakeStoredImage.findUniqueOrThrow({
      where: { name: "abc.webp" },
    })
    expect([...row.bytes]).toEqual([9, 8, 7])
    expect(row.contentType).toBe("image/webp")
  })

  it("a second put with the same name is a failure code, not an overwrite", async () => {
    await fakeStorage.put("abc.webp", new Uint8Array([1]), "image/webp")
    const again = await fakeStorage.put(
      "abc.webp",
      new Uint8Array([2]),
      "image/webp"
    )
    expect(again.ok).toBe(false)
    const row = await db.fakeStoredImage.findUniqueOrThrow({
      where: { name: "abc.webp" },
    })
    expect([...row.bytes]).toEqual([1])
  })

  it("delete removes a stored file", async () => {
    await fakeStorage.put("abc.webp", new Uint8Array([1]), "image/webp")
    expect(await fakeStorage.delete("/test-images/abc.webp")).toBe("deleted")
    expect(await db.fakeStoredImage.count()).toBe(0)
  })

  it("delete skips a URL that is not in the fake store, and logs the host", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const blobUrl =
      "https://prod9.public.blob.vercel-storage.com/products/a.webp"
    expect(await fakeStorage.delete(blobUrl)).toBe("skipped")
    expect(JSON.parse(info.mock.calls[0][0] as string)).toMatchObject({
      event: "image.delete_skipped",
      host: "prod9.public.blob.vercel-storage.com",
    })
    info.mockRestore()
  })
})

describe("imageStorage", () => {
  it("is the fake when IMAGE_STORAGE=fake (the test setup)", () => {
    expect(imageStorage()).toBe(fakeStorage)
  })
})
