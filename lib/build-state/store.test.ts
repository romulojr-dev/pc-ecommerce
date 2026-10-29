import { describe, expect, test } from "vitest"

import type { BuildItem, Slot } from "@/lib/builder"

import { BUILD_STORAGE_KEY, createBuildStore, type RawStorage } from "./store"

// The saved build (docs/specs/020-builder-page, "The saved build" and Rules
// › Store), on an in-memory stand-in for localStorage

function memoryStorage(initial?: string): RawStorage & { value?: string } {
  const storage: RawStorage & { value?: string } = {
    value: initial,
    getItem: () => storage.value ?? null,
    setItem: (_, value) => {
      storage.value = value
    },
    removeItem: () => {
      storage.value = undefined
    },
  }
  return storage
}

const item = (slot: Slot, productId: string, quantity = 1): BuildItem => ({
  slot,
  productId,
  quantity,
})

const saved = (items: unknown, version = 1) =>
  JSON.stringify({ state: { items }, version })

// A store read from `initial`, as the page does after hydration
function hydrated(initial?: string) {
  const storage = memoryStorage(initial)
  const store = createBuildStore(storage)
  store.persist.rehydrate()
  return { store, storage }
}

const stored = (storage: { value?: string }) => JSON.parse(storage.value!)

describe("reading the saved build", () => {
  test("starts empty, without a notice, when nothing is saved", () => {
    const { store } = hydrated()
    expect(store.getState()).toMatchObject({
      items: [],
      hydrated: true,
      noticeChanges: [],
    })
  })

  test("reads saved items in slot order", () => {
    const { store } = hydrated(
      saved([item("gpu", "rtx4060"), item("cpu", "ryzen5_7600")])
    )
    expect(store.getState().items).toEqual([
      item("cpu", "ryzen5_7600"),
      item("gpu", "rtx4060"),
    ])
  })

  test("isn't hydrated, and holds nothing, before the read", () => {
    const store = createBuildStore(memoryStorage(saved([item("cpu", "x")])))
    expect(store.getState()).toMatchObject({ items: [], hydrated: false })
  })

  test.each([
    ["isn't JSON", "not json"],
    ["has items that aren't a list", saved("x")],
  ])("starts over with a reset notice when the value %s (E52)", (_, value) => {
    const { store } = hydrated(value)
    expect(store.getState().items).toEqual([])
    expect(store.getState().noticeChanges.map((change) => change.kind)).toEqual(
      ["reset"]
    )
  })

  test("merges duplicate drives without a notice (E53)", () => {
    const { store } = hydrated(
      saved([item("storage", "pro990", 1), item("storage", "pro990", 2)])
    )
    expect(store.getState().items).toEqual([item("storage", "pro990", 3)])
    expect(store.getState().noticeChanges).toEqual([])
  })

  test("drops the last drives of a build over 20 products (E56)", () => {
    const others = [
      item("cpu", "c"),
      item("motherboard", "m"),
      item("memory", "r"),
      item("gpu", "g"),
      item("case", "k"),
      item("psu", "p"),
      item("cpu-cooler", "f"),
    ]
    const drives = Array.from({ length: 14 }, (_, i) =>
      item("storage", `d${i}`)
    )
    const { store } = hydrated(saved([...others, ...drives]))
    const storage = store.getState().items.filter((i) => i.slot === "storage")
    expect(storage.map((i) => i.productId)).toEqual(
      drives.slice(0, 13).map((i) => i.productId)
    )
    expect(store.getState().noticeChanges).toEqual([])
  })

  test("cleans a build saved under another version", () => {
    const { store } = hydrated(saved([item("cpu", "x", 3)], 0))
    expect(store.getState().items).toEqual([item("cpu", "x", 1)])
  })

  test("reads again when another tab changes the build", () => {
    const { store, storage } = hydrated(saved([item("cpu", "x")]))
    storage.value = saved([item("cpu", "x"), item("gpu", "y")])
    store.persist.rehydrate()
    expect(store.getState().items).toHaveLength(2)
  })
})

describe("saving", () => {
  test("saves only the items, under version 1", () => {
    const { store, storage } = hydrated()
    store.getState().add("cpu", "ryzen5_7600", 12)
    expect(stored(storage)).toEqual({
      state: { items: [item("cpu", "ryzen5_7600")] },
      version: 1,
    })
  })

  test("uses one storage key", () => {
    expect(BUILD_STORAGE_KEY).toBe("pc-silicon-build")
  })

  test("does nothing before the saved build has been read", () => {
    const storage = memoryStorage(saved([item("cpu", "ryzen5_7600")]))
    const store = createBuildStore(storage)
    expect(store.getState().add("gpu", "rtx4060", 10)).toBeNull()
    store.getState().remove("cpu", "ryzen5_7600")
    store.getState().dismissNotice()
    expect(stored(storage).state.items).toEqual([item("cpu", "ryzen5_7600")])
  })

  test("keeps working in memory when storage fails", () => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new Error("QuotaExceededError")
    }
    const store = createBuildStore(storage)
    store.persist.rehydrate()
    store.getState().add("cpu", "ryzen5_7600", 12)
    expect(store.getState().items).toEqual([item("cpu", "ryzen5_7600")])
  })
})

describe("actions", () => {
  test("add fills an empty slot and keeps slot order (E20)", () => {
    const { store } = hydrated(saved([item("gpu", "rtx4060")]))
    expect(store.getState().add("cpu", "ryzen5_7600", 12)).toEqual({
      kind: "add",
    })
    expect(store.getState().items).toEqual([
      item("cpu", "ryzen5_7600"),
      item("gpu", "rtx4060"),
    ])
  })

  test("add only plans a replacement; replace swaps the part (E22)", () => {
    const { store } = hydrated(saved([item("cpu", "ryzen5_7600")]))
    expect(store.getState().add("cpu", "i5_14400f", 20)).toEqual({
      kind: "confirm-replace",
      quantity: 1,
    })
    expect(store.getState().items).toEqual([item("cpu", "ryzen5_7600")])

    store.getState().replace("cpu", "i5_14400f", 1)
    expect(store.getState().items).toEqual([item("cpu", "i5_14400f")])
  })

  test("replace keeps the memory quantity it is given (E27)", () => {
    const { store } = hydrated(saved([item("memory", "vengeance", 2)]))
    store.getState().replace("memory", "flareX5", 2)
    expect(store.getState().items).toEqual([item("memory", "flareX5", 2)])
  })

  test("add raises the same kit (E25)", () => {
    const { store } = hydrated(saved([item("memory", "vengeance")]))
    store.getState().add("memory", "vengeance", 25)
    expect(store.getState().items).toEqual([item("memory", "vengeance", 2)])
  })

  test("add puts a new drive after the others (E30)", () => {
    const { store } = hydrated(
      saved([item("storage", "pro990"), item("gpu", "rtx4060")])
    )
    store.getState().add("storage", "mx500", 18)
    expect(store.getState().items).toEqual([
      item("storage", "pro990"),
      item("storage", "mx500"),
      item("gpu", "rtx4060"),
    ])
  })

  test("add raises the same drive (E31)", () => {
    const { store } = hydrated(saved([item("storage", "pro990")]))
    store.getState().add("storage", "pro990", 30)
    expect(store.getState().items).toEqual([item("storage", "pro990", 2)])
  })

  // docs/specs/021-slot-picker, Behavior 14
  test("add plans memory's kept quantity, capped at the new kit's stock (E16)", () => {
    const { store } = hydrated(saved([item("memory", "vengeance", 12)]))
    const plan = store.getState().add("memory", "flareX5", 11)
    expect(plan).toEqual({ kind: "confirm-replace", quantity: 11 })
    store.getState().replace("memory", "flareX5", 11)
    expect(store.getState().items).toEqual([item("memory", "flareX5", 11)])
  })

  test("add refuses a new drive in a build of 20 products (E20)", () => {
    const others = (
      ["cpu", "motherboard", "memory", "gpu", "case", "psu"] as const
    )
      .map((slot) => item(slot, slot))
      .concat(item("cpu-cooler", "cooler"))
    const drives = Array.from({ length: 13 }, (_, i) =>
      item("storage", `drive${i}`)
    )
    const { store } = hydrated(saved([...others, ...drives]))
    expect(store.getState().add("storage", "another", 10)).toEqual({
      kind: "full",
    })
    expect(store.getState().add("storage", "drive0", 10)).toEqual({
      kind: "raise",
      quantity: 2,
    })
    expect(store.getState().items).toHaveLength(20)
  })

  test("replaceDrive puts the new drive in the old one's place (E21)", () => {
    const { store } = hydrated(
      saved([item("storage", "pro990", 2), item("storage", "mx500")])
    )
    store.getState().replaceDrive("pro990", "sn850x", 20)
    expect(store.getState().items).toEqual([
      item("storage", "sn850x", 2),
      item("storage", "mx500"),
    ])
  })

  test("replaceDrive caps the kept quantity at the new drive's stock", () => {
    const { store } = hydrated(saved([item("storage", "pro990", 5)]))
    store.getState().replaceDrive("pro990", "sn850x", 3)
    expect(store.getState().items).toEqual([item("storage", "sn850x", 3)])
  })

  test("replaceDrive merges into a drive already in the build (E22)", () => {
    const { store } = hydrated(
      saved([item("storage", "pro990"), item("storage", "mx500")])
    )
    store.getState().replaceDrive("pro990", "mx500", 18)
    expect(store.getState().items).toEqual([item("storage", "mx500", 2)])
  })

  test("replaceDrive caps a merge at the stock", () => {
    const { store } = hydrated(
      saved([item("storage", "pro990", 3), item("storage", "mx500", 2)])
    )
    store.getState().replaceDrive("pro990", "mx500", 4)
    expect(store.getState().items).toEqual([item("storage", "mx500", 4)])
  })

  test("replaceDrive does nothing when the old drive is gone", () => {
    const { store } = hydrated(saved([item("storage", "mx500")]))
    store.getState().replaceDrive("pro990", "sn850x", 20)
    expect(store.getState().items).toEqual([item("storage", "mx500")])
  })

  test("replaceDrive waits for the saved build to be read", () => {
    const storage = memoryStorage(saved([item("storage", "pro990")]))
    const store = createBuildStore(storage)
    store.getState().replaceDrive("pro990", "sn850x", 20)
    store.persist.rehydrate()
    expect(store.getState().items).toEqual([item("storage", "pro990")])
  })

  test("remove empties a slot (E11)", () => {
    const { store } = hydrated(
      saved([item("cpu", "ryzen5_7600"), item("gpu", "rtx4060")])
    )
    store.getState().remove("gpu", "rtx4060")
    expect(store.getState().items).toEqual([item("cpu", "ryzen5_7600")])
  })

  test("setQuantity changes memory and drives (E12, E13)", () => {
    const { store } = hydrated(
      saved([item("memory", "vengeance"), item("storage", "pro990")])
    )
    store.getState().setQuantity("memory", "vengeance", 3)
    store.getState().setQuantity("storage", "pro990", 2)
    expect(store.getState().items).toEqual([
      item("memory", "vengeance", 3),
      item("storage", "pro990", 2),
    ])
  })

  test.each([0, -1, 1.5, Number.NaN])("setQuantity ignores %s", (quantity) => {
    const { store } = hydrated(saved([item("memory", "vengeance", 2)]))
    store.getState().setQuantity("memory", "vengeance", quantity)
    expect(store.getState().items).toEqual([item("memory", "vengeance", 2)])
  })

  test("setQuantity leaves one-part slots at 1", () => {
    const { store } = hydrated(saved([item("cpu", "ryzen5_7600")]))
    store.getState().setQuantity("cpu", "ryzen5_7600", 2)
    expect(store.getState().items).toEqual([item("cpu", "ryzen5_7600")])
  })

  test("drop removes parts that are gone and keeps them for the notice (E48)", () => {
    const { store, storage } = hydrated(
      saved([item("cpu", "ryzen5_7600"), item("gpu", "gone")])
    )
    store
      .getState()
      .drop([{ kind: "not-found", slot: "gpu", productId: "gone", detail: "" }])
    expect(store.getState().items).toEqual([item("cpu", "ryzen5_7600")])
    expect(stored(storage).state.items).toEqual([item("cpu", "ryzen5_7600")])
    expect(store.getState().noticeChanges).toHaveLength(1)

    store.getState().dismissNotice()
    expect(store.getState().noticeChanges).toEqual([])
  })
})

// Open in builder replaces the saved build with a shared one
// (docs/specs/022-share-build, Behavior 23–24)
describe("load", () => {
  const gone = (slot: Slot, productId: string) => ({
    kind: "not-found" as const,
    slot,
    productId,
    detail: "",
  })

  test("replaces the whole saved build, and saves it (E49, E50)", () => {
    const { store, storage } = hydrated(saved([item("cpu", "old")]))
    const shared = [item("cpu", "ryzen5_7600"), item("gpu", "rtx4060")]

    store.getState().load(shared, [])

    expect(store.getState().items).toEqual(shared)
    expect(stored(storage).state.items).toEqual(shared)
    expect(stored(storage).version).toBe(1)
  })

  test("loads into an empty build (E49)", () => {
    const { store } = hydrated()
    store.getState().load([item("cpu", "ryzen5_7600")], [])
    expect(store.getState().items).toEqual([item("cpu", "ryzen5_7600")])
    expect(store.getState().sharedGone).toEqual([])
  })

  test("keeps quantities and the order the drives come in (E55)", () => {
    const { store } = hydrated()
    const shared = [
      item("memory", "kit", 2),
      item("storage", "b"),
      item("storage", "a"),
    ]
    store.getState().load(shared, [])
    expect(store.getState().items).toEqual(shared)
  })

  test("keeps the parts left out for the notice, and saves only the items (E52)", () => {
    const { store, storage } = hydrated()
    const left = [gone("gpu", "rtx4060")]

    store.getState().load([item("cpu", "ryzen5_7600")], left)

    expect(store.getState().sharedGone).toEqual(left)
    expect(Object.keys(stored(storage).state)).toEqual(["items"])
  })

  test("drops an earlier notice, which was about the build it replaced", () => {
    const { store } = hydrated(
      saved([item("cpu", "ryzen5_7600"), item("gpu", "gone")])
    )
    store
      .getState()
      .drop([{ kind: "not-found", slot: "gpu", productId: "gone", detail: "" }])
    expect(store.getState().noticeChanges).toHaveLength(1)

    store.getState().load([item("cpu", "other")], [])

    expect(store.getState().noticeChanges).toEqual([])
  })

  test("dismissing the notice clears the shared-build lines too", () => {
    const { store } = hydrated()
    store.getState().load([item("cpu", "x")], [gone("gpu", "y")])
    store.getState().dismissNotice()
    expect(store.getState().sharedGone).toEqual([])
  })

  test("cleans what it is given with parseBuild, and the product cap", () => {
    const { store } = hydrated()
    const drives = Array.from({ length: 14 }, (_, index) =>
      item("storage", `drive-${index}`)
    )
    store
      .getState()
      .load(
        [
          item("cpu", "a"),
          item("cpu", "b"),
          item("storage", "x"),
          item("storage", "x"),
          ...drives,
        ],
        []
      )
    const { items } = store.getState()
    // One CPU, a merged drive, and no more than 20 different products
    expect(items.filter((entry) => entry.slot === "cpu")).toHaveLength(1)
    expect(items.find((entry) => entry.productId === "x")?.quantity).toBe(2)
    expect(
      new Set(items.map((entry) => entry.productId)).size
    ).toBeLessThanOrEqual(20)
  })

  test("waits for the saved build to be read (E56)", () => {
    const storage = memoryStorage(saved([item("cpu", "mine")]))
    const store = createBuildStore(storage)

    store.getState().load([item("cpu", "shared")], [])

    expect(store.getState().items).toEqual([])
    expect(stored(storage).state.items).toEqual([item("cpu", "mine")])
  })
})
