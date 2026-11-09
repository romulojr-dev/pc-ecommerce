import type { AuditAction, AuditEntity } from "./audit-data"
import { type AdminRole, can } from "./permissions"

// Words and links for the audit log (docs/specs/047-admin-audit-log-view,
// Behavior 4, 8, 9, R9, D6). Pure. The two records are keyed by the closed
// unions of audit-data.ts, so a new entity or action is a type error until it
// has a label.

export const ENTITY_LABELS: Record<AuditEntity, string> = {
  product: "Product",
  image: "Image",
  category: "Category",
  brand: "Brand",
  order: "Order",
  refund: "Refund",
  payment: "Payment",
  voucher: "Voucher",
  "shipping-rate": "Shipping rate",
  "store-settings": "Store settings",
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  published: "Published",
  retired: "Retired",
  "status-changed": "Status changed",
  cancelled: "Cancelled",
  "stock-adjusted": "Stock adjusted",
  "refund-recorded": "Refund recorded",
  "payment-reviewed": "Payment reviewed",
  "image-added": "Photo added",
  "image-removed": "Photo removed",
  "images-reordered": "Photos reordered",
  "image-alt-changed": "Alt text changed",
}

// "salePrice" -> "Sale price", "cancel-reason" -> "Cancel reason",
// "OUT_OF_STOCK" -> "Out of stock"
export function humanize(text: string): string {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-\s]+/g, " ")
    .trim()
    .toLowerCase()
  if (words === "") return "—"
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// A stored value from a list this code doesn't know (an older or newer row)
// still reads as words
export const entityLabel = (entity: string): string =>
  Object.hasOwn(ENTITY_LABELS, entity)
    ? ENTITY_LABELS[entity as AuditEntity]
    : humanize(entity)
export const actionLabel = (action: string): string =>
  Object.hasOwn(ACTION_LABELS, action)
    ? ACTION_LABELS[action as AuditAction]
    : humanize(action)

const FIELD_OVERRIDES: Record<string, string> = {
  sku: "SKU",
  brandId: "Brand ID",
  categoryId: "Category ID",
  weightGrams: "Weight (g)",
  lowStockAt: "Low-stock at",
  isFeatured: "Featured",
}

// "specs.cores" -> "Specs · Cores"
export function fieldLabel(path: string): string {
  return path
    .split(".")
    .map((part) =>
      Object.hasOwn(FIELD_OVERRIDES, part)
        ? FIELD_OVERRIDES[part]
        : humanize(part)
    )
    .join(" · ")
}

export type AuditTarget = { label: string; href: string | null }

// What an entry points at. A link is given only when the viewer can open the
// screen and the screen exists. Every later screen story adds its line here,
// which turns that entity's plain ids into links (spec 047, Out of scope).
export function auditTarget(
  role: AdminRole,
  entity: string,
  entityId: string,
  known: { orderNumber?: string; product?: { name: string; sku: string } }
): AuditTarget {
  if (entity === "order" && known.orderNumber) {
    return {
      label: known.orderNumber,
      href: can(role, "orders.view")
        ? `/admin/orders/${encodeURIComponent(known.orderNumber)}`
        : null,
    }
  }
  if (entity === "product" && known.product) {
    return {
      label: `${known.product.name} (${known.product.sku})`,
      href: can(role, "products.view")
        ? `/admin/products/${encodeURIComponent(entityId)}`
        : null,
    }
  }
  return { label: entityId, href: null }
}
