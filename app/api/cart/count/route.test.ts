import { beforeEach, describe, expect, test, vi } from "vitest"

import { getCartCount } from "@/lib/cart/cart"
import { readCartId } from "@/lib/cart/cookie"

import { GET } from "./route"

// docs/specs/025-cart-single-items, Behavior 13, E51: no cookie, or one that
// isn't a cart id, is 0 without a database query
vi.mock("@/lib/cart/cookie", () => ({ readCartId: vi.fn() }))
vi.mock("@/lib/cart/cart", () => ({
  getCartCount: vi.fn(() => {
    throw new Error("the database must not be read")
  }),
}))

beforeEach(() => {
  vi.mocked(getCartCount).mockClear()
})

describe("GET /api/cart/count", () => {
  test("E51: with no cart cookie it answers 0 and reads nothing", async () => {
    vi.mocked(readCartId).mockResolvedValue(null)

    const response = await GET()

    expect(await response.json()).toEqual({ count: 0 })
    expect(getCartCount).not.toHaveBeenCalled()
  })

  test("is no-store, and never sets a cookie", async () => {
    vi.mocked(readCartId).mockResolvedValue(null)

    const response = await GET()

    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })

  test("with a cart it answers that cart's count", async () => {
    vi.mocked(readCartId).mockResolvedValue("a".repeat(22))
    vi.mocked(getCartCount).mockResolvedValueOnce(3)

    const response = await GET()

    expect(await response.json()).toEqual({ count: 3 })
    expect(getCartCount).toHaveBeenCalledWith("a".repeat(22))
    expect(response.headers.get("Set-Cookie")).toBeNull()
  })
})
