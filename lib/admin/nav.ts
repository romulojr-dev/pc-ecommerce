import { ADMIN_COPY } from "./copy"
import { type AdminAction, type AdminRole, can } from "./permissions"

// The shell's navigation, filtered by the same can() the server uses
// (docs/specs/040-admin-permissions-audit-masking, Behavior 4, R20). Pure.
// Each Admin screen story adds its item here with the view action it needs.

export type NavItem = {
  key: "products" | "inventory" | "orders" | "customers" | "audit"
  label: string
  href: string
  action: AdminAction
}

const ALL_ITEMS: NavItem[] = [
  {
    key: "products",
    label: ADMIN_COPY.shell.productsNav,
    href: "/admin/products",
    action: "products.view",
  },
  {
    key: "inventory",
    label: ADMIN_COPY.shell.inventoryNav,
    href: "/admin/inventory",
    action: "inventory.view",
  },
  {
    key: "orders",
    label: ADMIN_COPY.shell.ordersNav,
    href: "/admin/orders",
    action: "orders.view",
  },
  {
    key: "customers",
    label: ADMIN_COPY.shell.customersNav,
    href: "/admin/customers",
    action: "customers.view",
  },
  {
    key: "audit",
    label: ADMIN_COPY.shell.auditNav,
    href: "/admin/audit",
    action: "audit.view",
  },
]

export function navItemsFor(role: AdminRole): NavItem[] {
  return ALL_ITEMS.filter((item) => can(role, item.action))
}
