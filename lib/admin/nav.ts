import { ADMIN_COPY } from "./copy"
import { type AdminAction, type AdminRole, can } from "./permissions"

// The shell's navigation, filtered by the same can() the server uses
// (docs/specs/040-admin-permissions-audit-masking, Behavior 4, R20). Pure.
// Each Admin screen story adds its item here with the view action it needs.

export type NavItem = {
  key: "orders"
  label: string
  href: string
  action: AdminAction
}

const ALL_ITEMS: NavItem[] = [
  {
    key: "orders",
    label: ADMIN_COPY.shell.ordersNav,
    href: "/admin/orders",
    action: "orders.view",
  },
]

export function navItemsFor(role: AdminRole): NavItem[] {
  return ALL_ITEMS.filter((item) => can(role, item.action))
}
