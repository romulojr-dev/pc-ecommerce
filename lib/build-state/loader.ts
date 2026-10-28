import {
  type AnyBuildPart,
  assembleBuild,
  type BuildChange,
  type BuildItem,
} from "@/lib/builder"

import type { BuilderPartData } from "./parts"

// The builder page's parts loader without React (docs/specs/020-builder-
// page, Behavior 5–8). hooks/use-build-parts.ts does the fetching.

type Loaded = ReadonlyMap<string, BuilderPartData>

// The `ids` to ask for, or null when every part is already loaded. When one
// is missing, every id is asked for, so the whole build is fresh. Removing a
// part or changing a quantity needs no request.
export function partsRequest(
  items: readonly BuildItem[],
  loaded: Loaded
): string | null {
  const ids = [...new Set(items.map((item) => item.productId))]
  return ids.every((id) => loaded.has(id)) ? null : ids.join(",")
}

const partsOf = (loaded: Loaded) =>
  new Map<string, AnyBuildPart>(
    [...loaded].map(([id, data]) => [id, data.part])
  )

// The build the rules and the summary read: the items with their loaded
// parts. Items not loaded yet are left out (their changes are ignored here).
export const assembleLoaded = (items: readonly BuildItem[], loaded: Loaded) =>
  assembleBuild(items, partsOf(loaded))

// The items a successful response showed to be gone: not found (deleted,
// draft, never existed) or in the wrong slot. Only ids that were in that
// request are judged, so a part added meanwhile isn't dropped (Behavior 7).
export function goneChanges(
  items: readonly BuildItem[],
  loaded: Loaded,
  requested: ReadonlySet<string>
): BuildChange[] {
  return assembleLoaded(items, loaded).changes.filter(
    (change) =>
      change.productId !== undefined && requested.has(change.productId)
  )
}
