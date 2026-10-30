"use client"

import { ShoppingCartIcon } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { useStore } from "zustand"

import { badgeText, cartCountLabel } from "@/lib/cart/count"
import { cartCountStore } from "@/lib/cart/count-store"
import { cn } from "@/lib/utils"

// The header's cart link with its count (docs/specs/025-cart-single-items,
// Behavior 12–15, FR-3). The count is read here, in the browser, so the
// layout never reads the cart cookie and static pages stay static (ADR 0003).
// Until it has loaded there is no badge, so the server render and the first
// client render are the same. Cart actions set the count in the shared store.
export function CartLink({ className }: { className?: string }) {
  const count = useStore(cartCountStore, (state) => state.count)

  useEffect(() => {
    // An action that finishes while this request is out wins (D8)
    const seqAtStart = cartCountStore.getState().seq
    const controller = new AbortController()
    fetch("/api/cart/count", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { count?: unknown } | null) => {
        if (typeof data?.count === "number") {
          cartCountStore.getState().fromRoute(data.count, seqAtStart)
        }
      })
      // No badge is better than a wrong one; nothing else depends on it
      .catch(() => {})
    return () => controller.abort()
  }, [])

  const badge = badgeText(count)
  return (
    <Link
      href="/cart"
      aria-label={cartCountLabel(count ?? 0)}
      className={cn("relative", className)}
    >
      <ShoppingCartIcon aria-hidden="true" />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums"
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
