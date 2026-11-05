import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

import { adminMarkerOf } from "@/lib/admin/marker"
import { can, isAdminAction, isReadAction } from "@/lib/admin/permissions"

// Finds UNGUARDED admin entry points (docs/specs/040-admin-permissions-audit-
// masking, R8): it imports each module and lists every exported function that
// lacks the adminAction marker. Listing the guarded ones instead would pass
// when a new unguarded one is added.

export type ModuleKind = "actions" | "route"

export type Unguarded = { file: string; export: string; reason: string }
export type Guarded = { file: string; export: string; action: string }

const HTTP_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
] as const

// True when the file's first statement is the "use server" directive. The
// words in a comment (lib/auth/auth.ts) don't count.
export function hasUseServerDirective(source: string): boolean {
  let rest = source
  for (;;) {
    rest = rest.replace(/^\s+/, "")
    if (rest.startsWith("//")) {
      const end = rest.indexOf("\n")
      rest = end === -1 ? "" : rest.slice(end + 1)
    } else if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/")
      rest = end === -1 ? "" : rest.slice(end + 2)
    } else break
  }
  return /^(["'])use server\1/.test(rest)
}

export function fileHasUseServerDirective(path: string): boolean {
  return hasUseServerDirective(readFileSync(path, "utf8"))
}

export async function scanModules(
  modules: { path: string; kind: ModuleKind }[]
): Promise<{ unguarded: Unguarded[]; guarded: Guarded[] }> {
  const unguarded: Unguarded[] = []
  const guarded: Guarded[] = []
  for (const { path, kind } of modules) {
    const exported = (await import(/* @vite-ignore */ path)) as Record<
      string,
      unknown
    >
    for (const [name, value] of Object.entries(exported)) {
      if (typeof value !== "function") continue
      if (
        kind === "route" &&
        !(HTTP_METHODS as readonly string[]).includes(name)
      )
        continue
      const action = adminMarkerOf(value)
      if (action === null) {
        unguarded.push({
          file: path,
          export: name,
          reason: "exported function has no adminAction marker",
        })
      } else guarded.push({ file: path, export: name, action })
    }
  }
  return { unguarded, guarded }
}

// ---- Discovery and placement (R8, R9) ----

const SKIP_DIRS = new Set(["node_modules", ".next", "generated", ".git"])
const SOURCE_FILE = /\.(ts|tsx)$/

export function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return []
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return SOURCE_FILE.test(name) ? [path] : []
  })
}

const MUTATING_EXPORT =
  /export\s+(?:async\s+function|const|function)\s+(POST|PUT|PATCH|DELETE)\b|export\s*\{[^}]*\b(POST|PUT|PATCH|DELETE)\b[^}]*\}/

// A route.ts that exports a write method, found by its source so the file
// needn't be imported
export function exportsWriteMethod(source: string): boolean {
  return MUTATING_EXPORT.test(source)
}

// A "use server" directive anywhere (a function-level one inside a page or a
// component counts), not only at the top of a file
export function hasAnyUseServerDirective(source: string): boolean {
  return /^\s*["']use server["']\s*;?\s*$/m.test(source)
}

// Problems with the markers of the guarded functions found: an action the
// table doesn't know, or a write action Demo is allowed to do
export function checkGuarded(guarded: Guarded[]): string[] {
  const problems: string[] = []
  for (const { file, export: name, action } of guarded) {
    if (!isAdminAction(action)) {
      problems.push(`${file} ${name}: marker names unknown action "${action}"`)
      continue
    }
    if (!isReadAction(action) && can("demo", action)) {
      problems.push(`${file} ${name}: "${action}" is a write Demo may do`)
    }
  }
  return problems
}
