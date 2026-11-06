"use server"

import { updateTag } from "next/cache"

import { adminAction } from "@/lib/admin/guard"
import { adjustStock, setLowStockAt } from "@/lib/admin/inventory/adjust"
import {
  adjustStockSchema,
  setLowStockAtSchema,
} from "@/lib/admin/inventory-input"
import { PRODUCTS_TAG } from "@/lib/home"

// Adjust stock and set the low-stock threshold (docs/specs/046-admin-
// inventory-adjustments). Built with adminAction: the session and
// `can("inventory.adjust")` are checked before the input is read. updateTag
// expires the product cache at once (ADR 0003, read-your-own-writes); it runs
// here, in the server action, after the transaction has committed, and only
// for a request that wrote (R10). There is no "set stock to N" action (D2).

export const adjustStockAction = adminAction(
  "inventory.adjust",
  adjustStockSchema,
  async ({ actor, input }) => {
    const result = await adjustStock(actor, input)
    if (result.kind === "adjusted") updateTag(PRODUCTS_TAG)
    return result
  }
)

export const setLowStockAtAction = adminAction(
  "inventory.adjust",
  setLowStockAtSchema,
  async ({ actor, input }) => {
    const result = await setLowStockAt(actor, input)
    if (result.kind === "saved") updateTag(PRODUCTS_TAG)
    return result
  }
)
