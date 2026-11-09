import { afterEach, describe, expect, it, type Mock, vi } from "vitest"

import { classifyStoredUrl } from "./own-store"
import { blobStorage, type BlobClient, newImageName } from "./blob-storage"

// Photo storage (docs/specs/049-product-images-upload, R5, R6, E15, E27,
// E52). The Blob client is a double: no network.

const TOKEN = "vercel_blob_rw_Own123_secret"
const OWN_HOST = "own123.public.blob.vercel-storage.com"
const OWN = `https://${OWN_HOST}/products/a.webp`
const PRODUCTION =
  "https://prod9.public.blob.vercel-storage.com/products/a.webp"

type Mocks = {
  put?: Mock<BlobClient["put"]>
  del?: Mock<BlobClient["del"]>
}

function client(overrides: Mocks = {}) {
  const put =
    overrides.put ??
    vi.fn<BlobClient["put"]>(async (pathname) => ({
      url: `https://${OWN_HOST}/${pathname}`,
    }))
  const del = overrides.del ?? vi.fn<BlobClient["del"]>(async () => undefined)
  const doubles = { put, del }
  return { doubles, factory: async (): Promise<BlobClient> => doubles }
}

afterEach(() => vi.restoreAllMocks())

describe("newImageName", () => {
  it("is 22 random URL-safe characters and .webp, never the same twice", () => {
    const names = Array.from({ length: 50 }, newImageName)
    for (const name of names) expect(name).toMatch(/^[A-Za-z0-9_-]{22}\.webp$/)
    expect(new Set(names).size).toBe(50)
  })
})

describe("classifyStoredUrl", () => {
  it("own Blob store", () => {
    expect(classifyStoredUrl(OWN, OWN_HOST)).toEqual({ kind: "own-blob" })
  })

  it("E52: a different store's host is another store", () => {
    expect(classifyStoredUrl(PRODUCTION, OWN_HOST)).toEqual({
      kind: "other",
      host: "prod9.public.blob.vercel-storage.com",
    })
  })

  it("http, lookalike hosts and junk are never own", () => {
    for (const url of [
      OWN.replace("https", "http"),
      `https://${OWN_HOST}.evil.com/a.webp`,
      `https://evil.com/${OWN_HOST}/a.webp`,
      "not a url",
      "/images/placeholders/cpu.svg",
    ]) {
      expect(classifyStoredUrl(url, OWN_HOST).kind).toBe("other")
    }
  })

  it("fake store paths are one plain segment", () => {
    expect(classifyStoredUrl("/test-images/abc.webp", null)).toEqual({
      kind: "fake",
      name: "abc.webp",
    })
    expect(classifyStoredUrl("/test-images/a/b.webp", null).kind).toBe("other")
    expect(classifyStoredUrl("/test-images/../x", null).kind).toBe("other")
  })
})

describe("blobStorage.put", () => {
  it("stores under products/ with the token, public, never overwriting", async () => {
    const { doubles, factory } = client()
    const result = await blobStorage(TOKEN, factory).put(
      "abc.webp",
      new Uint8Array([1, 2, 3]),
      "image/webp"
    )
    expect(result).toEqual({
      ok: true,
      url: `https://${OWN_HOST}/products/abc.webp`,
    })
    const [pathname, body, options] = doubles.put.mock.calls[0]
    expect(pathname).toBe("products/abc.webp")
    expect([...body]).toEqual([1, 2, 3])
    expect(options).toMatchObject({
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "image/webp",
      token: TOKEN,
    })
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it("E15: a failure is a short code, never the message", async () => {
    const boom = new Error(`secret ${TOKEN} leaked in a message`)
    boom.name = "BlobServiceNotAvailable"
    const { factory } = client({
      put: vi.fn<BlobClient["put"]>(async () => {
        throw boom
      }),
    })
    const result = await blobStorage(TOKEN, factory).put(
      "abc.webp",
      new Uint8Array(1),
      "image/webp"
    )
    expect(result).toEqual({ ok: false, code: "BlobServiceNotAvailable" })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it("a timeout is the code 'timeout'", async () => {
    const abort = new DOMException("aborted", "TimeoutError")
    const { factory } = client({
      put: vi.fn<BlobClient["put"]>(async () => {
        throw abort
      }),
    })
    expect(
      await blobStorage(TOKEN, factory).put("a.webp", new Uint8Array(1), "x")
    ).toEqual({ ok: false, code: "timeout" })
  })
})

describe("blobStorage.delete", () => {
  it("deletes a file on its own store", async () => {
    const { doubles, factory } = client()
    expect(await blobStorage(TOKEN, factory).delete(OWN)).toBe("deleted")
    expect(doubles.del).toHaveBeenCalledWith(OWN, { token: TOKEN })
  })

  it("E52: skips another store's file, calls nothing and logs the host", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    const { doubles, factory } = client()
    expect(await blobStorage(TOKEN, factory).delete(PRODUCTION)).toBe("skipped")
    expect(doubles.del).not.toHaveBeenCalled()
    expect(JSON.parse(info.mock.calls[0][0] as string)).toEqual({
      event: "image.delete_skipped",
      host: "prod9.public.blob.vercel-storage.com",
      code: "other-store",
    })
  })

  it("E27: a failed delete is logged with the path and a code, and never throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const boom = new Error(`token ${TOKEN}`)
    boom.name = "BlobUnknownError"
    const { factory } = client({
      del: vi.fn<BlobClient["del"]>(async () => {
        throw boom
      }),
    })
    expect(await blobStorage(TOKEN, factory).delete(OWN)).toBe("failed")
    const line = error.mock.calls[0][0] as string
    expect(JSON.parse(line)).toEqual({
      event: "image.delete_failed",
      path: "/products/a.webp",
      code: "BlobUnknownError",
    })
    expect(line).not.toContain(TOKEN)
  })
})
