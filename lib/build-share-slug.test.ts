import { describe, expect, test } from "vitest"

import { isShareSlug, randomSlug, SHARE_SLUG_LENGTH } from "./build-share-slug"

// docs/specs/022-share-build, Rules › Same contents, same link (Slug), E1, E35

describe("randomSlug", () => {
  test("is 10 characters of a-z and 0-9 (E1)", () => {
    const slug = randomSlug()
    expect(slug).toHaveLength(SHARE_SLUG_LENGTH)
    expect(slug).toMatch(/^[a-z0-9]{10}$/)
  })

  test("differs between calls", () => {
    const slugs = new Set(Array.from({ length: 50 }, () => randomSlug()))
    expect(slugs.size).toBe(50)
  })

  test("maps bytes to the alphabet in order", () => {
    // 0 → a, 25 → z, 26 → 0, 35 → 9, then wraps: 36 → a
    const bytes = () => Uint8Array.from([0, 25, 26, 35, 36, 1, 2, 3, 4, 5])
    expect(randomSlug(bytes)).toBe("az09abcdef")
  })

  test("skips bytes that would favor some characters", () => {
    // 252 and above are skipped (252 is 7 × 36), so every character is
    // equally likely
    const batches = [
      Uint8Array.from([252, 253, 254, 255, 0, 0, 0, 0, 0, 0]),
      Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ]
    let calls = 0
    const slug = randomSlug(() => batches[calls++])
    expect(slug).toBe("aaaaaaaaaa")
    expect(calls).toBe(2)
  })
})

describe("isShareSlug", () => {
  test("accepts a made slug and any 10 lowercase letters and digits", () => {
    expect(isShareSlug(randomSlug())).toBe(true)
    expect(isShareSlug("zzzzzzzzzz")).toBe(true)
    expect(isShareSlug("0123456789")).toBe(true)
  })

  test.each([
    "",
    "short",
    "abcdefghijk",
    "UPPERCASEX",
    "..%2Fadmin",
    "../admin12",
    "abc def ghi",
    "abcdefghi-",
    "a".repeat(200),
  ])("rejects %j (E35)", (value) => {
    expect(isShareSlug(value)).toBe(false)
  })
})
