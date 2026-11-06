// The changed fields of an audit entry (docs/specs/047-admin-audit-log-view,
// Behavior 9, R6). `before` and `after` hold the changed fields only, so the
// diff is the union of their keys. Nested objects are flattened to dotted
// paths (`specs.cores`) and only leaves that differ are listed. Arrays of
// plain values are one leaf, compared whole. Pure; never throws, on any JSON.

export const MAX_DIFF_DEPTH = 6

export type Leaf = unknown

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const isContainerArray = (value: unknown): value is unknown[] =>
  Array.isArray(value) && value.some((item) => isObject(item))

// Every leaf by its dotted path. An array holding objects is walked with the
// same path for each item (so a repeated key keeps the last value; audit rows
// don't hold such arrays today). Below the depth cap a subtree is one leaf.
export function flattenAudit(value: unknown): Map<string, Leaf> {
  const out = new Map<string, Leaf>()
  const walk = (node: unknown, path: string, depth: number) => {
    if (depth <= MAX_DIFF_DEPTH && isObject(node)) {
      for (const [key, item] of Object.entries(node)) {
        walk(item, path ? `${path}.${key}` : key, depth + 1)
      }
    } else if (depth <= MAX_DIFF_DEPTH && isContainerArray(node)) {
      for (const item of node) walk(item, path, depth + 1)
    } else if (path !== "") {
      out.set(path, node)
    }
  }
  walk(value, "", 0)
  return out
}

function sameLeaf(a: Leaf, b: Leaf): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export type DiffRow = {
  path: string
  // undefined: the key isn't in that side
  before: Leaf | undefined
  after: Leaf | undefined
}

export function auditDiff(before: unknown, after: unknown): DiffRow[] {
  const from = flattenAudit(before)
  const to = flattenAudit(after)
  const paths = [...new Set([...from.keys(), ...to.keys()])].sort()
  const rows: DiffRow[] = []
  for (const path of paths) {
    const b = from.has(path) ? from.get(path) : undefined
    const a = to.has(path) ? to.get(path) : undefined
    if (from.has(path) && to.has(path) && sameLeaf(b, a)) continue
    rows.push({ path, before: b, after: a })
  }
  return rows
}
