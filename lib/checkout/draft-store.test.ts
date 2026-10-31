import { describe, expect, it } from "vitest"

import {
  CHECKOUT_STORAGE_KEY,
  clearFrom,
  draftPayload,
  emptyDraft,
  isComplete,
  parseDraft,
} from "./draft"
import { createCheckoutDraftStore, type RawStorage } from "./draft-store"

// docs/specs/029-checkout-steps, Behavior 8, 12, 15 (N3, N5, N5b)

function memory(initial: Record<string, string> = {}): RawStorage & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => void (data[key] = value),
    removeItem: (key) => void delete data[key],
  }
}

const filled = {
  ...emptyDraft(),
  email: "ana@example.com",
  name: "Ana Santos",
  mobile: "0917 123 4567",
  regionCode: "1300000000",
  provinceCode: "1300000000",
  cityCode: "1381300000",
  barangayCode: "1381300001",
  street: "12 Mabini St",
  zip: "1100",
}

describe("the draft", () => {
  it("is complete when the shared schema accepts it", () => {
    expect(isComplete(filled)).toBe(true)
    expect(isComplete({ ...filled, mobile: "" })).toBe(false)
    expect(isComplete(emptyDraft())).toBe(false)
  })

  it("is complete for pickup without an address", () => {
    expect(
      isComplete({
        ...emptyDraft(),
        method: "pickup",
        email: filled.email,
        name: filled.name,
        mobile: filled.mobile,
      })
    ).toBe(true)
  })

  it("sends no address for pickup", () => {
    expect(draftPayload({ ...filled, method: "pickup" })).not.toHaveProperty(
      "address"
    )
  })

  it("clears a level and the levels below it, keeping street and ZIP", () => {
    const cleared = clearFrom(filled, "provinceCode")
    expect(cleared).toMatchObject({
      regionCode: "1300000000",
      provinceCode: "",
      cityCode: "",
      barangayCode: "",
      street: "12 Mabini St",
      zip: "1100",
    })
    expect(clearFrom(filled, "regionCode").regionCode).toBe("")
  })

  it("reads anything that isn't a draft as an empty one", () => {
    expect(parseDraft(null)).toEqual(emptyDraft())
    expect(parseDraft("text")).toEqual(emptyDraft())
    expect(parseDraft({ email: 5 })).toEqual(emptyDraft())
    expect(parseDraft({ email: "a@b.co" })).toEqual({
      ...emptyDraft(),
      email: "a@b.co",
    })
  })
})

describe("the draft store", () => {
  it("ignores changes until the saved details have been read", () => {
    const store = createCheckoutDraftStore(memory())
    store.getState().update({ email: "x@y.co" })
    expect(store.getState().draft.email).toBe("")
  })

  it("saves what is typed and reads it back (N3)", async () => {
    const storage = memory()
    const first = createCheckoutDraftStore(storage)
    await first.persist.rehydrate()
    first.getState().update({ email: "ana@example.com", street: "12 Mabini" })
    expect(storage.data[CHECKOUT_STORAGE_KEY]).toContain("ana@example.com")

    const second = createCheckoutDraftStore(storage)
    await second.persist.rehydrate()
    expect(second.getState().hydrated).toBe(true)
    expect(second.getState().draft).toMatchObject({
      email: "ana@example.com",
      street: "12 Mabini",
    })
  })

  it("starts empty from a different version or a broken value", async () => {
    const old = memory({
      [CHECKOUT_STORAGE_KEY]: JSON.stringify({
        state: { draft: { email: "old@example.com" } },
        version: 0,
      }),
    })
    const store = createCheckoutDraftStore(old)
    await store.persist.rehydrate()
    expect(store.getState().draft).toEqual(emptyDraft())

    const broken = createCheckoutDraftStore(
      memory({ [CHECKOUT_STORAGE_KEY]: "{not json" })
    )
    await broken.persist.rehydrate()
    expect(broken.getState().draft).toEqual(emptyDraft())
    expect(broken.getState().hydrated).toBe(true)
  })

  it("forgets the details and removes them from storage once an order exists (X2)", async () => {
    const storage = memory()
    const store = createCheckoutDraftStore(storage)
    await store.persist.rehydrate()
    store.getState().update({ email: "ana@example.com", street: "12 Mabini" })
    expect(storage.data[CHECKOUT_STORAGE_KEY]).toBeDefined()

    store.getState().clear()

    expect(store.getState().draft).toEqual(emptyDraft())
    expect(storage.data[CHECKOUT_STORAGE_KEY]).toBeUndefined()
    // Nothing is left for another read
    const again = createCheckoutDraftStore(storage)
    await again.persist.rehydrate()
    expect(again.getState().draft).toEqual(emptyDraft())
  })

  it("keeps working in memory when storage is blocked", async () => {
    const blocked: RawStorage = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
      removeItem: () => {
        throw new Error("blocked")
      },
    }
    const store = createCheckoutDraftStore(blocked)
    await store.persist.rehydrate()
    store.getState().update({ name: "Ana" })
    expect(store.getState().draft.name).toBe("Ana")
  })
})
