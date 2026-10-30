import { describe, expect, test } from "vitest"

import { createCartCountStore } from "./count-store"

// docs/specs/025-cart-single-items, Behavior 14, D8
describe("cart count store", () => {
  test("starts unknown, so the first render has no badge", () => {
    expect(createCartCountStore().getState().count).toBeNull()
  })

  test("the route sets the count when no action has finished since", () => {
    const store = createCartCountStore()
    store.getState().fromRoute(3, store.getState().seq)
    expect(store.getState().count).toBe(3)
  })

  test("an action's count is never overwritten by an older route response", () => {
    const store = createCartCountStore()
    const seqAtStart = store.getState().seq
    store.getState().fromAction(2)
    store.getState().fromRoute(0, seqAtStart)
    expect(store.getState().count).toBe(2)
  })

  test("a later action replaces an earlier one", () => {
    const store = createCartCountStore()
    store.getState().fromAction(2)
    store.getState().fromAction(1)
    expect(store.getState().count).toBe(1)
  })
})
