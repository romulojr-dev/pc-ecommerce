import { describe, expect, test } from "vitest"

import {
  blobHostOf,
  blobProductionHostSchema,
  blobStoreIdOf,
  blobStoreOf,
  imageEnvIssues,
  imageHostsOf,
  imageRemotePatterns,
  imageStorageSchema,
} from "./env-schema"

const TOKEN = "vercel_blob_rw_AbC123_secretPart9"
const STORE_ID = "store_AbC123"

describe("IMAGE_STORAGE", () => {
  test("E40: unset is refused with 'is not set'", () => {
    const result = imageStorageSchema.safeParse(undefined)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe("is not set")
  })

  test("only blob and fake are accepted", () => {
    expect(imageStorageSchema.safeParse("blob").success).toBe(true)
    expect(imageStorageSchema.safeParse("fake").success).toBe(true)
    expect(imageStorageSchema.safeParse("s3").error?.issues[0].message).toBe(
      "must be blob or fake"
    )
  })
})

describe("imageEnvIssues", () => {
  test("E41: the fake is refused in production", () => {
    expect(
      imageEnvIssues({ IMAGE_STORAGE: "fake", VERCEL_ENV: "production" })
    ).toEqual([
      { variable: "IMAGE_STORAGE", message: "must be blob in production" },
    ])
  })

  test("the fake is fine in preview, development and unset", () => {
    for (const VERCEL_ENV of ["preview", "development", undefined]) {
      expect(imageEnvIssues({ IMAGE_STORAGE: "fake", VERCEL_ENV })).toEqual([])
    }
  })

  test("E42: blob needs a store id or a token", () => {
    expect(imageEnvIssues({ IMAGE_STORAGE: "blob" })).toEqual([
      {
        variable: "BLOB_STORE_ID",
        message:
          "is not set (IMAGE_STORAGE=blob needs BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN)",
      },
    ])
  })

  test("blob with only a store id (OIDC) is fine, in production too", () => {
    for (const BLOB_STORE_ID of [STORE_ID, "AbC123"]) {
      expect(
        imageEnvIssues({
          IMAGE_STORAGE: "blob",
          BLOB_STORE_ID,
          VERCEL_ENV: "production",
        })
      ).toEqual([])
    }
  })

  test("a malformed store id is refused", () => {
    expect(
      imageEnvIssues({ IMAGE_STORAGE: "blob", BLOB_STORE_ID: "store_a-b" })
    ).toEqual([
      {
        variable: "BLOB_STORE_ID",
        message: "is not a Vercel Blob store id (store_…)",
      },
    ])
  })

  test("a store id and a token for the same store are fine", () => {
    expect(
      imageEnvIssues({
        IMAGE_STORAGE: "blob",
        BLOB_STORE_ID: "store_abc123",
        BLOB_READ_WRITE_TOKEN: TOKEN,
      })
    ).toEqual([])
  })

  test("a token for another store than BLOB_STORE_ID is refused", () => {
    const issues = imageEnvIssues({
      IMAGE_STORAGE: "blob",
      BLOB_STORE_ID: "store_Other9",
      BLOB_READ_WRITE_TOKEN: TOKEN,
    })
    expect(issues).toEqual([
      {
        variable: "BLOB_READ_WRITE_TOKEN",
        message: "is for a different store than BLOB_STORE_ID",
      },
    ])
    expect(JSON.stringify(issues)).not.toContain(TOKEN)
  })

  test("a token that is not a Blob token is refused without echoing it", () => {
    const issues = imageEnvIssues({
      IMAGE_STORAGE: "blob",
      BLOB_READ_WRITE_TOKEN: "not-a-token-secret-value",
    })
    expect(issues).toHaveLength(1)
    expect(issues[0].message).not.toContain("not-a-token-secret-value")
  })

  test("blob with a token is fine, in production too", () => {
    expect(
      imageEnvIssues({
        IMAGE_STORAGE: "blob",
        BLOB_READ_WRITE_TOKEN: TOKEN,
        VERCEL_ENV: "production",
      })
    ).toEqual([])
  })
})

describe("blobHostOf", () => {
  test("the store id, lower-cased, plus the public host", () => {
    expect(blobHostOf(TOKEN)).toBe("abc123.public.blob.vercel-storage.com")
  })

  test.each(["", "vercel_blob_rw_", "vercel_blob_rw_abc", "xyz_abc_def"])(
    "%j is not a token",
    (token) => {
      expect(blobHostOf(token)).toBeNull()
    }
  )
})

describe("blobStoreIdOf", () => {
  test("with or without the store_ prefix", () => {
    expect(blobStoreIdOf("store_AbC123")).toBe("AbC123")
    expect(blobStoreIdOf("AbC123")).toBe("AbC123")
  })

  test.each(["", "store_", "store_a b", "https://x"])(
    "%j is not a store id",
    (value) => {
      expect(blobStoreIdOf(value)).toBeNull()
    }
  )
})

describe("blobStoreOf", () => {
  test("the store id wins and authenticates with OIDC", () => {
    expect(
      blobStoreOf({ BLOB_STORE_ID: STORE_ID, BLOB_READ_WRITE_TOKEN: TOKEN })
    ).toEqual({
      host: "abc123.public.blob.vercel-storage.com",
      auth: { storeId: "AbC123" },
    })
  })

  test("the token alone authenticates with the token", () => {
    expect(blobStoreOf({ BLOB_READ_WRITE_TOKEN: TOKEN })).toEqual({
      host: "abc123.public.blob.vercel-storage.com",
      auth: { token: TOKEN },
    })
  })

  test("nothing, or nothing valid, is null", () => {
    expect(blobStoreOf({})).toBeNull()
    expect(blobStoreOf({ BLOB_STORE_ID: "a-b" })).toBeNull()
    expect(blobStoreOf({ BLOB_READ_WRITE_TOKEN: "nope" })).toBeNull()
  })
})

describe("BLOB_PRODUCTION_HOST", () => {
  test("unset is fine; a Blob host is fine", () => {
    expect(blobProductionHostSchema.safeParse(undefined).success).toBe(true)
    expect(
      blobProductionHostSchema.safeParse("prod9.public.blob.vercel-storage.com")
        .success
    ).toBe(true)
  })

  test.each([
    "evil.example.com",
    "https://prod9.public.blob.vercel-storage.com",
    "prod9.public.blob.vercel-storage.com.evil.com",
    "a.b.public.blob.vercel-storage.com",
  ])("E43c: %s is refused", (host) => {
    expect(blobProductionHostSchema.safeParse(host).success).toBe(false)
  })
})

describe("imageHostsOf", () => {
  test("E43: the environment's own store only", () => {
    expect(
      imageHostsOf({ IMAGE_STORAGE: "blob", BLOB_READ_WRITE_TOKEN: TOKEN })
    ).toEqual(["abc123.public.blob.vercel-storage.com"])
    expect(
      imageHostsOf({ IMAGE_STORAGE: "blob", BLOB_STORE_ID: STORE_ID })
    ).toEqual(["abc123.public.blob.vercel-storage.com"])
  })

  test("E43b: production's host too, when set", () => {
    expect(
      imageHostsOf({
        IMAGE_STORAGE: "blob",
        BLOB_READ_WRITE_TOKEN: TOKEN,
        BLOB_PRODUCTION_HOST: "prod9.public.blob.vercel-storage.com",
      })
    ).toEqual([
      "abc123.public.blob.vercel-storage.com",
      "prod9.public.blob.vercel-storage.com",
    ])
  })

  test("the same host twice is listed once", () => {
    expect(
      imageHostsOf({
        IMAGE_STORAGE: "blob",
        BLOB_READ_WRITE_TOKEN: TOKEN,
        BLOB_PRODUCTION_HOST: "abc123.public.blob.vercel-storage.com",
      })
    ).toHaveLength(1)
  })

  test("E44: the fake has no Blob host, even with a token present", () => {
    expect(
      imageHostsOf({ IMAGE_STORAGE: "fake", BLOB_READ_WRITE_TOKEN: TOKEN })
    ).toEqual([])
  })
})

describe("imageRemotePatterns", () => {
  test("E43: https, the products folder only, no wildcard host", () => {
    expect(
      imageRemotePatterns({
        IMAGE_STORAGE: "blob",
        BLOB_READ_WRITE_TOKEN: TOKEN,
      })
    ).toEqual([
      {
        protocol: "https",
        hostname: "abc123.public.blob.vercel-storage.com",
        pathname: "/products/**",
      },
    ])
  })

  test("E44: none for the fake", () => {
    expect(imageRemotePatterns({ IMAGE_STORAGE: "fake" })).toEqual([])
  })
})
