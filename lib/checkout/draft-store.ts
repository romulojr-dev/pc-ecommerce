import { persist, type PersistStorage } from "zustand/middleware"
import { createStore } from "zustand/vanilla"

import {
  CHECKOUT_STORAGE_KEY,
  CHECKOUT_STORAGE_VERSION,
  type CheckoutDraft,
  emptyDraft,
  parseDraft,
} from "./draft"

// The step-1 details of this tab (docs/specs/029-checkout-steps, Behavior 8,
// D4): a zustand store saved to sessionStorage, read after the first mount
// like the saved build, so the server render and the first client render
// match. Nothing here reaches the server except through the review.

export type RawStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

type Persisted = { draft: unknown }

export type CheckoutDraftState = {
  draft: CheckoutDraft
  // The saved details have been read; until then the form is not shown
  hydrated: boolean
  update: (patch: Partial<CheckoutDraft>) => void
  // Replaces the whole draft (clearing a level and its children)
  replace: (draft: CheckoutDraft) => void
}

// Storage errors (blocked, private mode, quota) are swallowed: the details
// then live in memory for the visit. A value that isn't JSON reads as none.
function jsonStorage(
  getStorage: () => RawStorage | undefined
): PersistStorage<Persisted> {
  return {
    getItem(name) {
      try {
        const raw = getStorage()?.getItem(name)
        return raw == null ? null : JSON.parse(raw)
      } catch {
        return null
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

export function createCheckoutDraftStore(
  storage: RawStorage | undefined = typeof window === "undefined"
    ? undefined
    : window.sessionStorage
) {
  return createStore<CheckoutDraftState>()(
    persist(
      (set, get) => ({
        draft: emptyDraft(),
        hydrated: false,
        // Every change waits for the read, so it can't overwrite the saved
        // details with an empty form
        update: (patch) => {
          if (get().hydrated) set({ draft: { ...get().draft, ...patch } })
        },
        replace: (draft) => {
          if (get().hydrated) set({ draft })
        },
      }),
      {
        name: CHECKOUT_STORAGE_KEY,
        version: CHECKOUT_STORAGE_VERSION,
        storage: jsonStorage(() => storage),
        skipHydration: true,
        partialize: (state): Persisted => ({ draft: state.draft }),
        // A different version, or data that isn't a draft, starts empty
        migrate: () => ({ draft: null }),
        merge: (persisted, current) => ({
          ...current,
          draft: parseDraft((persisted as Persisted | undefined)?.draft),
          hydrated: true,
        }),
      }
    )
  )
}

export const checkoutDraftStore = createCheckoutDraftStore()
