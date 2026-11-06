"use server"

import { updateTag } from "next/cache"

import { adminAction } from "@/lib/admin/guard"
import {
  createProductSchema,
  updateProductSchema,
} from "@/lib/admin/product-input"
import { createProduct, updateProduct } from "@/lib/admin/products/save"
import { PRODUCTS_TAG } from "@/lib/home"

// Create and edit a product (docs/specs/045-admin-products-create-edit). Built
// with adminAction: the session and `can("products.write")` are checked before
// the input is read. updateTag expires the product cache at once, so the owner
// sees their own write (ADR 0003, read-your-own-writes); it runs here, in the
// server action, after the save's transaction has committed, and only for a
// save that wrote. There is no delete action (R14).

export const createProductAction = adminAction(
  "products.write",
  createProductSchema,
  async ({ actor, input }) => {
    const result = await createProduct(actor, input)
    if (result.kind === "saved") updateTag(PRODUCTS_TAG)
    return result
  }
)

export const updateProductAction = adminAction(
  "products.write",
  updateProductSchema,
  async ({ actor, input }) => {
    const result = await updateProduct(actor, input)
    if (result.kind === "saved") updateTag(PRODUCTS_TAG)
    return result
  }
)
