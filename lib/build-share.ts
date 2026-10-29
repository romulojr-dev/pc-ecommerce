import { contentHashOf } from "@/lib/build-share-hash"
import { randomSlug } from "@/lib/build-share-slug"
import { type ShareResult, shareInput } from "@/lib/build-state/share"
import { getBuilderParts } from "@/lib/builder-parts"
import { assembleBuild, canonicalItems } from "@/lib/builder"
import { db } from "@/lib/db"
import { manilaToday } from "@/lib/stock"

// Sharing a build (docs/specs/022-share-build, Rules › Same contents, same
// link and › Validating what the server receives; ADR 0007). The server
// action is a thin wrapper around this, and the integration tests call it
// directly. Anyone can reach it, so it checks everything itself.

// A slug that collides with another build's is retried this many times in
// all. With 36^10 slugs it takes bad luck or a broken generator.
const SLUG_ATTEMPTS = 3

type Options = {
  // Where the random slugs come from; tests force collisions
  newSlug?: () => string
  // Manila's date, for pre-order status; tests pass a fixed one
  today?: string
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "P2002"

const slugOf = async (contentHash: string) =>
  (
    await db.build.findUnique({
      where: { contentHash },
      select: { shareSlug: true },
    })
  )?.shareSlug

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

    const contentHash = contentHashOf(items)
    const existing = await slugOf(contentHash)
    if (existing) return { ok: true, slug: existing }

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      try {
        // One nested create is one transaction: the build and all its items,
        // or nothing
        const build = await db.build.create({
          data: {
            shareSlug: newSlug(),
            contentHash,
            items: {
              create: canonicalItems(items).map(
                ([slot, productId, quantity]) => ({ slot, productId, quantity })
              ),
            },
          },
          select: { shareSlug: true },
        })
        return { ok: true, slug: build.shareSlug }
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        // Another request just shared these contents: use its row
        const raced = await slugOf(contentHash)
        if (raced) return { ok: true, slug: raced }
        // Otherwise the slug was taken by another build: try a new one
      }
    }
    console.error("shareBuild: no free slug after", SLUG_ATTEMPTS, "tries")
    return { ok: false, reason: "error" }
  } catch (error) {
    console.error("shareBuild failed:", error)
    return { ok: false, reason: "error" }
  }
}
