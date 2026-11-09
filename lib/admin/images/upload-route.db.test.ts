import sharp from "sharp"
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest"

import { uploadProductImage } from "./upload"
import { PRODUCTS_TAG } from "@/lib/home"
import { detectImageType } from "@/lib/images/rules"
import { fakeStorage, type ImageStorage } from "@/lib/images/storage"
import {
  makeStaffUser,
  resetSignInIps,
  signInCookie,
} from "@/test-support/admin-session"
import { insertParts } from "@/test-support/build-fixtures"
import { db, resetCatalog } from "@/test-support/db"
import { seed } from "@/test-support/seed-parts"

// docs/specs/049-product-images-upload: the upload route with real sessions
// and the fake store (B14–B17, R1–R5, E1, E3–E6, E9, E11–E17, E18)

let currentHeaders = new Headers()
vi.mock("next/headers", () => ({ headers: async () => currentHeaders }))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  },
}))
const revalidateTag = vi.fn()
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  updateTag: vi.fn(),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}))

// recordAudit runs as in production; the flag makes it throw right after
// writing, so the test sees the row, the audit entry and the stored file all
// go (R5)
let failAfterAudit = false
vi.mock("@/lib/admin/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/admin/audit")>()
  return {
    ...real,
    recordAudit: async (
      ...args: Parameters<typeof real.recordAudit>
    ): Promise<void> => {
      await real.recordAudit(...args)
      if (failAfterAudit) throw new Error("forced after the audit row")
    },
  }
})

const { POST } = await import("../../../app/api/admin/images/route")

const ORIGIN = "http://localhost:3000"
let productId: string

async function jpeg(width = 800, height = 600) {
  return sharp({
    create: { width, height, channels: 3, background: "teal" },
  })
    .jpeg()
    .toBuffer()
}

async function signedIn(email: string, role: "OWNER" | "STAFF" | "DEMO") {
  await makeStaffUser(email, role)
  currentHeaders = new Headers({ cookie: await signInCookie(email) })
}

type Options = {
  query?: string
  origin?: string | null
  contentLength?: string | null
  body?: BodyInit | null
}

function upload(opts: Options = {}) {
  const headers = new Headers()
  if (opts.origin !== null) headers.set("origin", opts.origin ?? ORIGIN)
  headers.set("cookie", currentHeaders.get("cookie") ?? "")
  if (opts.contentLength !== null && opts.contentLength !== undefined) {
    headers.set("content-length", opts.contentLength)
  }
  return POST(
    new Request(
      `${ORIGIN}/api/admin/images${opts.query ?? `?kind=product&id=${productId}`}`,
      {
        method: "POST",
        headers,
        body: opts.body ?? null,
        duplex: "half",
      } as RequestInit
    ),
    {} as never
  )
}

async function send(buffer: Uint8Array, opts: Options = {}) {
  return upload({
    contentLength: String(buffer.length),
    body: buffer as BodyInit,
    ...opts,
  })
}

// A body that records whether anything read it (E3, E4, E5, E9). A
// high-water mark of 0 means `pull` runs only when a reader asks for a chunk,
// not when the stream is made or handed to a Request.
function unreadable() {
  let read = false
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        read = true
        throw new Error("the body was read")
      },
    },
    { highWaterMark: 0 }
  )
  return { stream, wasRead: () => read }
}

const counts = async () => ({
  images: await db.productImage.count(),
  stored: await db.fakeStoredImage.count(),
  audit: await db.auditLog.count(),
})

beforeEach(async () => {
  resetSignInIps()
  failAfterAudit = false
  revalidateTag.mockClear()
  await resetCatalog()
  await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
  const ids = await insertParts([seed.ryzen5_7600])
  productId = ids.get(seed.ryzen5_7600.id)!
  await signedIn("owner@example.com", "OWNER")
})
afterAll(() => db.$disconnect())

describe("a valid upload (Owner)", () => {
  test("E1: stores a WebP, adds the row with the product name as alt, audits and revalidates", async () => {
    const response = await send(await jpeg())
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.ok).toBe(true)
    expect(body.image.alt).toBe(seed.ryzen5_7600.name)
    expect(body.image.url).toMatch(/^\/test-images\/[A-Za-z0-9_-]{22}\.webp$/)

    const rows = await db.productImage.findMany()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      productId,
      sortOrder: 0,
      url: body.image.url,
    })

    const name = body.image.url.replace("/test-images/", "")
    const file = await db.fakeStoredImage.findUniqueOrThrow({ where: { name } })
    expect(file.contentType).toBe("image/webp")
    expect(detectImageType(file.bytes)).toBe("webp")

    const audit = await db.auditLog.findMany()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      entity: "product",
      entityId: productId,
      action: "image-added",
    })
    expect(audit[0].after).toMatchObject({
      imageId: rows[0].id,
      url: body.image.url,
      alt: seed.ryzen5_7600.name,
      position: 0,
    })
    expect(revalidateTag).toHaveBeenCalledWith(PRODUCTS_TAG, "max")
  })

  test("E2: the next photos go at the end, in order", async () => {
    for (let n = 0; n < 3; n++) {
      expect((await send(await jpeg())).status).toBe(201)
    }
    const rows = await db.productImage.findMany({
      orderBy: { sortOrder: "asc" },
    })
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2])
  })

  test("E7: the bytes decide the type: a PNG is accepted and stored as WebP", async () => {
    const png = await sharp({
      create: { width: 50, height: 50, channels: 3, background: "red" },
    })
      .png()
      .toBuffer()
    const response = await send(png)
    expect(response.status).toBe(201)
    const name = (await response.json()).image.url.replace("/test-images/", "")
    const file = await db.fakeStoredImage.findUniqueOrThrow({ where: { name } })
    expect(detectImageType(file.bytes)).toBe("webp")
  })

  test("E46: a large photo is stored at most 2000 px wide", async () => {
    const response = await send(await jpeg(3000, 2000))
    const name = (await response.json()).image.url.replace("/test-images/", "")
    const file = await db.fakeStoredImage.findUniqueOrThrow({ where: { name } })
    expect((await sharp(file.bytes).metadata()).width).toBe(2000)
  })

  test("E18: a draft product takes photos", async () => {
    await db.product.update({
      where: { id: productId },
      data: { status: "DRAFT" },
    })
    expect((await send(await jpeg())).status).toBe(201)
  })
})

describe("who may upload, and what is read first", () => {
  test("E3: Demo is refused before a byte of the body is read", async () => {
    await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
    await signedIn("demo@example.com", "DEMO")
    const body = unreadable()
    const before = await counts()
    const response = await upload({
      contentLength: "3000000",
      body: body.stream,
    })
    expect(response.status).toBe(403)
    expect((await response.json()).message).toBe("This account is read-only")
    expect(body.wasRead()).toBe(false)
    expect(await counts()).toEqual(before)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  test("Staff is refused too, without reading the body", async () => {
    await db.$executeRaw`TRUNCATE TABLE "RateLimit", "Session", "Account", "Verification", "User" CASCADE`
    await signedIn("staff@example.com", "STAFF")
    const body = unreadable()
    const response = await upload({ contentLength: "1000", body: body.stream })
    expect(response.status).toBe(403)
    expect(body.wasRead()).toBe(false)
  })

  test("E4: signed out is a 401 and nothing is read", async () => {
    currentHeaders = new Headers()
    const body = unreadable()
    const response = await upload({ contentLength: "1000", body: body.stream })
    expect(response.status).toBe(401)
    expect(body.wasRead()).toBe(false)
  })

  test("E5: a foreign Origin is a 403 and nothing is read", async () => {
    const body = unreadable()
    const response = await upload({
      origin: "https://evil.example",
      contentLength: "1000",
      body: body.stream,
    })
    expect(response.status).toBe(403)
    expect(body.wasRead()).toBe(false)
    expect(await counts()).toEqual({ images: 0, stored: 0, audit: 0 })
  })

  test("a missing Origin is a 403", async () => {
    const response = await upload({
      origin: null,
      contentLength: "3",
      body: new Uint8Array([1, 2, 3]),
    })
    expect(response.status).toBe(403)
  })
})

describe("what is refused, with nothing written", () => {
  const nothing = { images: 0, stored: 0, audit: 0 }

  test("E6: SVG text is a 400 with the type message", async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"/>'
    )
    const response = await send(svg)
    expect(response.status).toBe(400)
    expect((await response.json()).message).toBe(
      "Only JPEG, PNG and WebP photos can be uploaded."
    )
    expect(await counts()).toEqual(nothing)
  })

  test("E8: a PDF is refused whatever it is called", async () => {
    const response = await send(new TextEncoder().encode("%PDF-1.7 ..."))
    expect(response.status).toBe(400)
    expect(await counts()).toEqual(nothing)
  })

  test("E9: a declared length over 4 MB is a 413 without reading the body", async () => {
    const body = unreadable()
    const response = await upload({
      contentLength: String(4 * 1024 * 1024 + 1),
      body: body.stream,
    })
    expect(response.status).toBe(413)
    expect((await response.json()).message).toBe("It is larger than 4 MB.")
    expect(body.wasRead()).toBe(false)
    expect(await counts()).toEqual(nothing)
  })

  test("E11: a body longer than its header said is cut off at 4 MB", async () => {
    const big = new Uint8Array(5 * 1024 * 1024)
    big.set([0xff, 0xd8, 0xff])
    const response = await upload({ contentLength: "1048576", body: big })
    expect(response.status).toBe(413)
    expect(await counts()).toEqual(nothing)
  })

  test("a missing Content-Length is a 411", async () => {
    const response = await upload({
      contentLength: null,
      body: new Uint8Array([0xff, 0xd8, 0xff]),
    })
    expect(response.status).toBe(411)
  })

  test("E12: a ninth photo is a 409 and stores nothing", async () => {
    await db.productImage.createMany({
      data: Array.from({ length: 8 }, (_, n) => ({
        productId,
        url: `/test-images/seed${n}.webp`,
        alt: "a",
        sortOrder: n,
      })),
    })
    const response = await send(await jpeg())
    expect(response.status).toBe(409)
    expect((await response.json()).message).toBe(
      "This product already has 8 photos. Remove one to add another."
    )
    expect(await db.fakeStoredImage.count()).toBe(0)
    expect(await db.productImage.count()).toBe(8)
  })

  test("E14: an unknown product is a 404 and stores nothing", async () => {
    const response = await send(await jpeg(), {
      query: "?kind=product&id=zzzzzzzzzzzzzzzzzzzzzzzzz",
    })
    expect(response.status).toBe(404)
    expect(await counts()).toEqual(nothing)
  })

  test("E17: kind=brand is not a target yet", async () => {
    const response = await send(await jpeg(), {
      query: `?kind=brand&id=${productId}`,
    })
    expect(response.status).toBe(400)
    expect((await response.json()).message).toBe("Unknown upload target.")
  })

  test("a malformed id or a missing query is a 400", async () => {
    for (const query of [
      "",
      "?kind=product",
      "?kind=product&id=X%20Y",
      "?id=abc",
    ]) {
      expect((await send(await jpeg(), { query })).status).toBe(400)
    }
  })

  test("E49: more than 40 megapixels is a 400, nothing stored", async () => {
    const big = await sharp({
      create: { width: 8000, height: 6000, channels: 3, background: "white" },
    })
      .png({ compressionLevel: 9 })
      .toBuffer()
    const response = await send(big)
    expect(response.status).toBe(400)
    expect((await response.json()).message).toBe(
      "It has too many pixels (the limit is 40 megapixels)."
    )
    expect(await counts()).toEqual(nothing)
  })

  test("E50: bytes that only start like a JPEG are a 400", async () => {
    const response = await send(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4]))
    expect(response.status).toBe(400)
    expect((await response.json()).message).toBe(
      "It couldn't be read as a photo."
    )
    expect(await counts()).toEqual(nothing)
  })
})

async function jpegBody() {
  const buffer = await jpeg()
  return {
    productId,
    contentLength: String(buffer.length),
    body: new Blob([new Uint8Array(buffer)]).stream(),
  }
}

describe("the store and the transaction (R5)", () => {
  test("E15: a store failure is a 502 and writes no row and no audit", async () => {
    const failing: ImageStorage = {
      put: async () => ({ ok: false, code: "BlobServiceNotAvailable" }),
      delete: async () => "skipped",
    }
    const actor = await actorOf()
    const result = await uploadProductImage(actor, await jpegBody(), {
      storage: failing,
    })
    expect(result).toMatchObject({ kind: "refused", status: 502 })
    expect(await counts()).toEqual({ images: 0, stored: 0, audit: 0 })
  })

  test("E13: two uploads racing for the last place: one is added, the other refused, its file deleted", async () => {
    await db.productImage.createMany({
      data: Array.from({ length: 7 }, (_, n) => ({
        productId,
        url: `/test-images/seed${n}.webp`,
        alt: "a",
        sortOrder: n,
      })),
    })
    const actor = await actorOf()
    // Both have passed every check and stored their file before either writes
    let arrived = 0
    let release!: () => void
    const bothStored = new Promise<void>((resolve) => (release = resolve))
    const afterStore = async () => {
      arrived += 1
      if (arrived === 2) release()
      await bothStored
    }
    const [a, b] = await Promise.all([
      uploadProductImage(actor, await jpegBody(), { afterStore }),
      uploadProductImage(actor, await jpegBody(), { afterStore }),
    ])
    expect([a.kind, b.kind].sort()).toEqual(["added", "refused"])
    const refused = [a, b].find((r) => r.kind === "refused")
    expect(refused).toMatchObject({ status: 409 })
    expect(await db.productImage.count()).toBe(8)
    // Only the winner's file is left
    expect(await db.fakeStoredImage.count()).toBe(1)
    expect(await db.auditLog.count()).toBe(1)
  })

  test("a product that disappears meanwhile is a 404 and its file is deleted", async () => {
    const actor = await actorOf()
    const result = await uploadProductImage(actor, await jpegBody(), {
      afterStore: async () => {
        await db.product.delete({ where: { id: productId } })
      },
    })
    expect(result).toMatchObject({ kind: "refused", status: 404 })
    expect(await db.fakeStoredImage.count()).toBe(0)
  })

  test("E16: a failing transaction rolls back the row and the audit, and the stored file is deleted", async () => {
    failAfterAudit = true
    const response = await send(await jpeg())
    failAfterAudit = false
    expect(response.status).toBe(500)
    expect(await counts()).toEqual({ images: 0, stored: 0, audit: 0 })
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  test("a file deleted after a rollback goes through the store's own delete", async () => {
    const deleted: string[] = []
    const spying: ImageStorage = {
      put: (...args) => fakeStorage.put(...args),
      delete: async (url) => {
        deleted.push(url)
        return fakeStorage.delete(url)
      },
    }
    failAfterAudit = true
    const actor = await actorOf()
    await expect(
      uploadProductImage(actor, await jpegBody(), { storage: spying })
    ).rejects.toThrow("forced after the audit row")
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toMatch(/^\/test-images\//)
  })
})

async function actorOf() {
  const user = await db.user.findFirstOrThrow({
    where: { email: "owner@example.com" },
  })
  return { id: user.id, name: user.name, role: "owner" as const }
}
