import { readFileSync } from "node:fs"

import { adminMarkerOf } from "@/lib/admin/marker"

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
