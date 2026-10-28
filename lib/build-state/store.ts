import { persist, type PersistStorage } from "zustand/middleware"
import { createStore } from "zustand/vanilla"

import {
  type BuildChange,
  type BuildItem,
  parseBuild,
  SLOT_LIMITS,
  SLOTS,
  type Slot,
} from "@/lib/builder"

import { capProducts } from "./parts"
import { type AddPlan, planAdd } from "./plan-add"

// The saved build (docs/specs/020-builder-page, "The saved build"): only
// { slot, productId, quantity } items, in localStorage. Prices, stock and
// specs are loaded fresh from the server on every visit.

export const BUILD_STORAGE_KEY = "pc-silicon-build"
const VERSION = 1

// The slice of localStorage the store uses; tests pass an in-memory one
export type RawStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

type Persisted = { items: unknown }

export type BuildState = {
  items: BuildItem[]
  // The saved build has been read. Until then the store holds nothing and
  // ignores every action, so it can't overwrite the saved build.
  hydrated: boolean
  // Changes the shopper is told about (Rules › Store): a reset, and parts
  // that are no longer available. buildNotice turns them into copy.
  noticeChanges: BuildChange[]
  // Plans the add and applies "add" and "raise". Returns null before the
  // read. A "confirm-replace" changes nothing until replace is called.
  add: (slot: Slot, productId: string, stock: number) => AddPlan | null
  replace: (slot: Slot, productId: string, quantity: number) => void
  remove: (slot: Slot, productId: string) => void
  setQuantity: (slot: Slot, productId: string, quantity: number) => void
  // Removes the parts assembleBuild reported as gone and keeps the changes
  // for the notice
  drop: (changes: readonly BuildChange[]) => void
  dismissNotice: () => void
}

// localStorage as JSON. A value that isn't JSON reads as items: null, so
// parseBuild reports a reset. Storage errors (blocked, private mode, quota)
// are swallowed: the build then lives in memory for the visit.
function jsonStorage(
  getStorage: () => RawStorage | undefined
): PersistStorage<Persisted> {
  return {
    getItem(name) {
      let raw: string | null | undefined
      try {
        raw = getStorage()?.getItem(name)
      } catch {
        return null
      }
      if (raw == null) return null
      try {
        return JSON.parse(raw)
      } catch {
        return { state: { items: null }, version: VERSION }
      }
    },
    setItem(name, value) {
      try {
        getStorage()?.setItem(name, JSON.stringify(value))
      } catch {}
    },
    removeItem(name) {
      try {
        getStorage()?.removeItem(name)
      } catch {}
    },
  }
}

const slotOrder = (slot: Slot) => SLOTS.indexOf(slot)

// Slot order; a stable sort keeps the drives in the order they were added
const sorted = (items: BuildItem[]) =>
  items.sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))

const isEntry = (slot: Slot, productId: string) => (item: BuildItem) =>
  item.slot === slot && item.productId === productId

export function createBuildStore(
  storage: RawStorage | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage
) {
  return createStore<BuildState>()(
    persist(
      (set, get) => {
        // Every change waits for the read (Behavior 22)
        const update = (change: (items: BuildItem[]) => BuildItem[]) => {
          if (get().hydrated) set({ items: change([...get().items]) })
        }

        return {
          items: [],
          hydrated: false,
          noticeChanges: [],

          add(slot, productId, stock) {
            if (!get().hydrated) return null
            const plan = planAdd(get().items, { slot, productId, stock })
            if (plan.kind === "add") {
              update((items) =>
                sorted([...items, { slot, productId, quantity: 1 }])
              )
            } else if (plan.kind === "raise") {
              update((items) =>
                items.map((item) =>
                  isEntry(slot, productId)(item)
                    ? { ...item, quantity: plan.quantity }
                    : item
                )
              )
            }
            return plan
          },

          replace(slot, productId, quantity) {
            update((items) =>
              sorted([
                ...items.filter((item) => item.slot !== slot),
                { slot, productId, quantity },
              ])
            )
          },

          remove(slot, productId) {
            update((items) =>
              items.filter((item) => !isEntry(slot, productId)(item))
            )
          },

          setQuantity(slot, productId, quantity) {
            if (SLOT_LIMITS[slot].quantity === "one") return
            if (!Number.isInteger(quantity) || quantity < 1) return
            update((items) =>
              items.map((item) =>
                isEntry(slot, productId)(item) ? { ...item, quantity } : item
              )
            )
          },

          drop(changes) {
            const gone = changes.filter(
              (change) =>
                change.kind === "not-found" || change.kind === "wrong-category"
            )
            if (gone.length === 0 || !get().hydrated) return
            update((items) =>
              items.filter(
                (item) =>
                  !gone.some(
                    (change) =>
                      change.slot === item.slot &&
                      change.productId === item.productId
                  )
              )
            )
            set({ noticeChanges: [...get().noticeChanges, ...gone] })
          },

          // Every set saves the items, so this waits for the read too
          dismissNotice() {
            if (get().hydrated) set({ noticeChanges: [] })
          },
        }
      },
      {
        name: BUILD_STORAGE_KEY,
        version: VERSION,
        storage: jsonStorage(() => storage),
        // The page reads the saved build after mounting, so the server and
        // the first client render match (Behavior 9)
        skipHydration: true,
        partialize: (state): Persisted => ({ items: state.items }),
        // Every version, and corrupted data, is cleaned by merge
        migrate: (persisted) => persisted as Persisted,
        // Everything read goes through parseBuild, then the product cap.
        // Only a reset is worth telling the shopper; the other repairs come
        // from hand-edited data (D5).
        merge(persisted, current) {
          const { items, changes } = parseBuild(
            (persisted as Persisted | undefined)?.items
          )
          const resets = changes.filter((change) => change.kind === "reset")
          return {
            ...current,
            items: capProducts(items),
            hydrated: true,
            noticeChanges: [...current.noticeChanges, ...resets],
          }
        },
      }
    )
  )
}

export type BuildStore = ReturnType<typeof createBuildStore>

// The browser's one store. On the server it has no storage and is never
// hydrated, so it stays empty.
export const buildStore = createBuildStore()
