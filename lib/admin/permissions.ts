// Who may do what in Admin (docs/specs/040-admin-permissions-audit-masking,
// AD-11). Pure: the browser (to show or disable controls) and the server (to
// refuse) run the same table. The table is the contract; permissions.test.ts
// repeats it row by row.

export const ADMIN_ROLES = ["owner", "staff", "demo"] as const
export type AdminRole = (typeof ADMIN_ROLES)[number]

export const ADMIN_ACTIONS = [
  "dashboard.view",
  "orders.view",
  "orders.search-customer",
  "orders.packing-slip",
  "orders.transition",
  "orders.cancel",
  "customers.view",
  "refunds.record",
  "payments.review",
  "products.view",
  "products.write",
  "images.write",
  "categories.view",
  "brands.view",
  "categories.write",
  "brands.write",
  "inventory.view",
  "inventory.adjust",
  "settings.view",
  "vouchers.view",
  "settings.write",
  "rates.write",
  "vouchers.write",
  "audit.view",
] as const
export type AdminAction = (typeof ADMIN_ACTIONS)[number]

const OWNER_ONLY = { owner: true, staff: false, demo: false } as const
const OWNER_AND_DEMO = { owner: true, staff: false, demo: true } as const
const OWNER_AND_STAFF = { owner: true, staff: true, demo: false } as const
const EVERYONE = { owner: true, staff: true, demo: true } as const

const TABLE: Record<AdminAction, Record<AdminRole, boolean>> = {
  "dashboard.view": OWNER_AND_DEMO,
  "orders.view": EVERYONE, // Demo sees it masked
  "orders.search-customer": OWNER_AND_STAFF,
  "orders.packing-slip": EVERYONE, // Demo sees it masked
  "orders.transition": OWNER_AND_STAFF,
  "orders.cancel": OWNER_AND_STAFF,
  "customers.view": EVERYONE, // Demo sees it masked
  "refunds.record": OWNER_ONLY,
  "payments.review": OWNER_ONLY,
  "products.view": OWNER_AND_DEMO,
  "products.write": OWNER_ONLY,
  "images.write": OWNER_ONLY,
  "categories.view": OWNER_AND_DEMO,
  "brands.view": OWNER_AND_DEMO,
  "categories.write": OWNER_ONLY,
  "brands.write": OWNER_ONLY,
  "inventory.view": EVERYONE,
  "inventory.adjust": OWNER_AND_STAFF,
  "settings.view": OWNER_AND_DEMO,
  "vouchers.view": OWNER_AND_DEMO,
  "settings.write": OWNER_ONLY,
  "rates.write": OWNER_ONLY,
  "vouchers.write": OWNER_ONLY,
  "audit.view": OWNER_AND_DEMO, // Demo sees it masked
}

// An unknown role or action (a bad row, a stale client) is not allowed
export function can(role: string, action: string): boolean {
  if (!Object.hasOwn(TABLE, action)) return false
  const row = TABLE[action as AdminAction]
  if (!Object.hasOwn(row, role)) return false
  return row[role as AdminRole]
}

export function isAdminRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value)
}

export function isAdminAction(value: string): value is AdminAction {
  return (ADMIN_ACTIONS as readonly string[]).includes(value)
}

// Actions that only read. Demo may hold these; the enumeration test requires
// every other action to be denied to Demo. `orders.search-customer` is not
// listed: it is a read Demo is denied on purpose.
export function isReadAction(action: AdminAction): boolean {
  return action.endsWith(".view") || action === "orders.packing-slip"
}

// Actions Staff is denied but Owner has: the denial says so
export function isOwnerOnly(action: AdminAction): boolean {
  return TABLE[action].owner && !TABLE[action].staff
}

// The database's role (OWNER, STAFF, DEMO) as the table's role; null for
// anything else, which means no access
export function adminRoleOf(userRole: string): AdminRole | null {
  const lower = userRole.toLowerCase()
  return userRole === userRole.toUpperCase() && isAdminRole(lower)
    ? lower
    : null
}
