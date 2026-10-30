"use client"

import { useEffect } from "react"
import { useStore } from "zustand"

import { CHECKOUT_STORAGE_KEY } from "@/lib/checkout/draft"
import {
  type CheckoutDraftState,
  checkoutDraftStore,
} from "@/lib/checkout/draft-store"

let started = false

// Reads the saved details once, after the first mount, and again when this
// tab's storage changes under it (sessionStorage is per tab, so a `storage`
// event only fires for frames of the same tab)
function start() {
  if (started) return
  started = true
  checkoutDraftStore.persist.rehydrate()
  window.addEventListener("storage", (event) => {
    if (event.key === CHECKOUT_STORAGE_KEY || event.key === null) {
      checkoutDraftStore.persist.rehydrate()
    }
  })
}

// The step-1 details of this tab (docs/specs/029-checkout-steps, Behavior 8).
// The server render and the first client render both see the empty, unread
// store, so there is no hydration mismatch.
export function useCheckoutDraft<T>(
  selector: (state: CheckoutDraftState) => T
): T {
  useEffect(start, [])
  return useStore(checkoutDraftStore, selector)
}
