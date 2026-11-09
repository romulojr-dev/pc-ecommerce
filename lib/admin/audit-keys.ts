// The two rules every audit key has (docs/specs/047-admin-audit-log-view,
// Behavior 9 and 12, R9, D13): how Owner reads its value (a FORMAT rule) and
// how Demo reads it (a DEMO rule). One registry, so a key can't be shown
// without both having been decided. Pure.
//
// A key with no rule is plain text for Owner and hidden for Demo: the safe
// default for the role that must never see customer data. A test runs every
// audited mutation and fails when a key it wrote has no rule (R9), so the
// default is never what a real writer relies on.

export type FormatRule = "pesos" | "status" | "date" | "plain"

export const MASK_KINDS = [
  "name",
  "email",
  "mobile",
  "tracking",
  "address",
] as const
export type MaskKind = (typeof MASK_KINDS)[number]

export type DemoRule = "shown" | "hidden" | `masked:${MaskKind}`

export type KeyRule = { format: FormatRule; demo: DemoRule }

const SHOWN_PLAIN: KeyRule = { format: "plain", demo: "shown" }
const HIDDEN_PLAIN: KeyRule = { format: "plain", demo: "hidden" }
const PESOS: KeyRule = { format: "pesos", demo: "shown" }
const STATUS: KeyRule = { format: "status", demo: "shown" }
const DATE: KeyRule = { format: "date", demo: "shown" }
const masked = (kind: MaskKind): KeyRule => ({
  format: "plain",
  demo: `masked:${kind}`,
})

// Keyed by the key's leaf name, lower-cased
const RULES: Record<string, KeyRule> = {
  // Products
  name: SHOWN_PLAIN,
  sku: SHOWN_PLAIN,
  slug: SHOWN_PLAIN,
  brandid: SHOWN_PLAIN,
  category: SHOWN_PLAIN,
  categoryid: SHOWN_PLAIN,
  description: SHOWN_PLAIN,
  weightgrams: SHOWN_PLAIN,
  warrantymonths: SHOWN_PLAIN,
  boxcontents: SHOWN_PLAIN,
  isfeatured: SHOWN_PLAIN,
  // Photos (docs/specs/049-product-images-upload): ids, the stored URL, the
  // alt text, the position and the photos' order as ids joined by commas
  imageid: SHOWN_PLAIN,
  url: SHOWN_PLAIN,
  alt: SHOWN_PLAIN,
  position: SHOWN_PLAIN,
  photoorder: SHOWN_PLAIN,
  preordershipson: DATE,
  price: PESOS,
  saleprice: PESOS,
  // Stock
  stock: SHOWN_PLAIN,
  lowstockat: SHOWN_PLAIN,
  reason: STATUS,
  // Orders
  status: STATUS,
  cancelreason: STATUS,
  refundrequired: SHOWN_PLAIN,
  paidat: DATE,
  courier: SHOWN_PLAIN,
  trackingnumber: masked("tracking"),
  // Customer data
  guestemail: masked("email"),
  email: masked("email"),
  customeremail: masked("email"),
  contactname: masked("name"),
  customername: masked("name"),
  contactmobile: masked("mobile"),
  mobile: masked("mobile"),
  phone: masked("mobile"),
  customermobile: masked("mobile"),
  street: masked("address"),
  zip: masked("address"),
  barangayname: masked("address"),
  cityname: masked("address"),
  provincename: masked("address"),
  barangaycode: masked("address"),
  citycode: masked("address"),
  provincecode: masked("address"),
  address: masked("address"),
  // Free text
  note: HIDDEN_PLAIN,
  notes: HIDDEN_PLAIN,
  comment: HIDDEN_PLAIN,
  comments: HIDDEN_PLAIN,
  message: HIDDEN_PLAIN,
  memo: HIDDEN_PLAIN,
  remarks: HIDDEN_PLAIN,
  instructions: HIDDEN_PLAIN,
}

// A whole subtree under one prefix: a product's spec fields are named by the
// category's schema (lib/specs), so they are not listed one by one
const PREFIX_RULES: [prefix: string, rule: KeyRule][] = [
  ["specs.", SHOWN_PLAIN],
]

export function leafOf(path: string): string {
  const i = path.lastIndexOf(".")
  return (i === -1 ? path : path.slice(i + 1)).toLowerCase()
}

function ruleFor(path: string): KeyRule | null {
  for (const [prefix, rule] of PREFIX_RULES) {
    if (path.toLowerCase().startsWith(prefix)) return rule
  }
  return Object.hasOwn(RULES, leafOf(path)) ? RULES[leafOf(path)] : null
}

// null when no rule decides it
export const formatRuleOf = (path: string): FormatRule | null =>
  ruleFor(path)?.format ?? null
export const demoRuleOf = (path: string): DemoRule | null =>
  ruleFor(path)?.demo ?? null

// What is used when no rule decides it
export const effectiveFormat = (path: string): FormatRule =>
  formatRuleOf(path) ?? "plain"
export const effectiveDemo = (path: string): DemoRule =>
  demoRuleOf(path) ?? "hidden"

export const RULED_KEYS: readonly string[] = Object.keys(RULES)
