import { randomSlug } from "@/lib/build-share-slug"
import { type ShareResult, shareInput } from "@/lib/build-state/share"
import { getBuilderParts } from "@/lib/builder-parts"
import { assembleBuild } from "@/lib/builder"
import { upsertBuildSnapshot } from "@/lib/build-snapshot"
import { db } from "@/lib/db"
import { manilaToday } from "@/lib/stock"

// Sharing a build (docs/specs/022-share-build, Rules › Same contents, same
// link and › Validating what the server receives; ADR 0007). The server
// action is a thin wrapper around this, and the integration tests call it
// directly. Anyone can reach it, so it checks everything itself.

type Options = {
  // Where the random slugs come from; tests force collisions
  newSlug?: () => string
  // Manila's date, for pre-order status; tests pass a fixed one
  today?: string
}

export async function shareBuild(
  input: unknown,
  { newSlug = randomSlug, today = manilaToday() }: Options = {}
): Promise<ShareResult> {
  // Shape, size, repairs and quantity: no database yet
  const checked = shareInput(input)
  if (!checked.ok) return checked
  const { items } = checked

  try {
    // Every product must be active, in a builder category, and in its own
    // slot: the check the builder's parts route applies, then assembleBuild
    const parts = await getBuilderParts(
      items.map((item) => item.productId),
      today
    )
    const { changes } = assembleBuild(
      items,
      new Map(parts.map((data) => [data.part.id, data.part]))
    )
    if (changes.length > 0) return { ok: false, reason: "unavailable" }

    // One transaction: the build and all its items, or nothing. An existing
    // build with these contents (also one a concurrent share just made) is
    // reused, so repeated and parallel shares give one row.
    const { shareSlug } = await db.$transaction((tx) =>
      upsertBuildSnapshot(tx, items, { newSlug })
    )
    return { ok: true, slug: shareSlug }
  } catch (error) {
    console.error("shareBuild failed:", error)
    return { ok: false, reason: "error" }
  }
}
