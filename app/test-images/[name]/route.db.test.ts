import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

import { db, resetCatalog } from "@/test-support/db"

import { GET } from "./route"

// The fake photo store's route (docs/specs/049-product-images-upload, E44,
// E45)

beforeEach(async () => {
  vi.unstubAllEnvs()
  await resetCatalog()
  await db.fakeStoredImage.create({
    data: {
      name: "abc123.webp",
      contentType: "image/webp",
      bytes: Buffer.from([82, 73, 70, 70]),
    },
  })
})
afterAll(() => db.$disconnect())

const get = (name: string) =>
  GET(new Request(`http://localhost/test-images/${name}`), {
    params: Promise.resolve({ name }),
  } as never)

describe("GET /test-images/[name]", () => {
  it("E44: serves the stored bytes with their type, cached for good", async () => {
    const response = await get("abc123.webp")
    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("image/webp")
    expect(response.headers.get("Cache-Control")).toContain("immutable")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      82, 73, 70, 70,
    ])
  })

  it("an unknown name is a 404", async () => {
    expect((await get("nobody.webp")).status).toBe(404)
  })

  it.each(["../secret", "a/b", "", "x".repeat(81), "a b.webp"])(
    "a name that is not one plain segment (%j) is a 404",
    async (name) => {
      expect((await get(name)).status).toBe(404)
    }
  )

  it("E45: a 404 whatever the table holds unless IMAGE_STORAGE=fake", async () => {
    // lib/env reads process.env once at import; the route reads env, so the
    // switch is tested through the module's env object
    const { env } = await import("@/lib/env")
    const original = env.IMAGE_STORAGE
    Object.assign(env, { IMAGE_STORAGE: "blob" })
    try {
      expect((await get("abc123.webp")).status).toBe(404)
    } finally {
      Object.assign(env, { IMAGE_STORAGE: original })
    }
    expect((await get("abc123.webp")).status).toBe(200)
  })
})
