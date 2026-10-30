import { readFileSync } from "node:fs"
import path from "node:path"

import { expect, test } from "./test"

// The address data route (docs/specs/028-shipping-data-and-fee-rules,
// Behavior 8, R1–R6). Plain HTTP requests against the running app: in CI that
// is the production build, which serves the files the build traced.

const IMMUTABLE = "public, max-age=31536000, immutable"
const folder = path.join(process.cwd(), "data", "psgc", "json", "2026Q3")
const onDisk = (relative: string) =>
  readFileSync(path.join(folder, relative), "utf8")

test.describe("known files", () => {
  test("R1: regions.json is JSON, kept forever, and equals the committed file", async ({
    request,
  }) => {
    const response = await request.get("/api/psgc/2026Q3/regions.json")

    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toMatch(/^application\/json/)
    expect(response.headers()["cache-control"]).toBe(IMMUTABLE)
    expect(await response.text()).toBe(onDisk("regions.json"))
    expect(await response.json()).toHaveLength(18)
  })

  test("R2: a region's provinces and a province's cities", async ({
    request,
  }) => {
    const provinces = await request.get(
      "/api/psgc/2026Q3/provinces/1300000000.json"
    )
    expect(provinces.status()).toBe(200)
    expect(provinces.headers()["cache-control"]).toBe(IMMUTABLE)
    expect(await provinces.json()).toEqual([
      { code: "1300000000", name: "Metro Manila", kind: "pseudo" },
    ])

    const cities = await request.get("/api/psgc/2026Q3/cities/1300000000.json")
    expect(cities.status()).toBe(200)
    expect(cities.headers()["cache-control"]).toBe(IMMUTABLE)
    expect(await cities.json()).toHaveLength(17)
  })

  test("R3: manifest.json names the version", async ({ request }) => {
    const response = await request.get("/api/psgc/2026Q3/manifest.json")

    expect(response.status()).toBe(200)
    expect(response.headers()["cache-control"]).toBe(IMMUTABLE)
    expect(await response.json()).toMatchObject({
      version: "2026Q3",
      counts: { regions: 18, provinces: 102, cities: 1642, barangays: 42010 },
    })
  })
})

test.describe("misses are never kept", () => {
  for (const url of [
    "/api/psgc/2099Q1/regions.json",
    "/api/psgc/2026Q3/cities/9999999999.json",
    "/api/psgc/2026Q3/provinces/abc.json",
    "/api/psgc/2026Q3/nothing.json",
  ]) {
    test(`R4: ${url} is a 404 with no-store and an empty body`, async ({
      request,
    }) => {
      const response = await request.get(url)

      expect(response.status()).toBe(404)
      expect(response.headers()["cache-control"]).toBe("no-store")
      expect(await response.text()).toBe("")
    })
  }
})

test.describe("nothing outside the dataset is read", () => {
  // Encoded so that the request client doesn't fold the dots away before
  // sending; the server still sees them as a segment
  for (const url of [
    "/api/psgc/2026Q3/cities/..%2F..%2F..%2F..%2Fpackage.json",
    "/api/psgc/2026Q3/..%2F..%2F..%2Fpackage.json",
    "/api/psgc/..%2F..%2Fpackage.json/regions.json",
    "/api/psgc/2026Q3/regions.json/x",
    "/api/psgc/2026Q3/cities/1300000000.json.bak",
  ]) {
    test(`R5: ${url} is a 404`, async ({ request }) => {
      const response = await request.get(url)

      expect(response.status()).toBe(404)
      expect(response.headers()["cache-control"]).not.toContain("immutable")
      const body = await response.text()
      expect(body).not.toContain("pc-ecommerce")
      expect(body).not.toContain('"scripts"')
    })
  }
})

test("R6: only GET is served", async ({ request }) => {
  for (const method of ["post", "put", "delete", "patch"] as const) {
    const response = await request[method]("/api/psgc/2026Q3/regions.json")
    expect(response.status(), method).toBe(405)
  }
})
