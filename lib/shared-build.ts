import { cache } from "react"

import { type SharedItem, toSharedItems } from "@/lib/build-state/shared"
import { getBuilderParts } from "@/lib/builder-parts"
import { db } from "@/lib/db"
import { manilaToday } from "@/lib/stock"

// Reading a shared build (docs/specs/022-share-build, Behavior 10–15). The
// snapshot holds only items; everything else is read now, on every request
// (ADR 0003: per-request data), so prices, stock, specs and a part's status
// are current. Nothing here is cached across requests.

export type SharedBuildSnapshot = {
  slug: string
  items: SharedItem[]
}

async function load(
  slug: string,
  today: string
): Promise<SharedBuildSnapshot | null> {
  const build = await db.build.findUnique({
    where: { shareSlug: slug },
    select: {
      shareSlug: true,
      items: {
        select: {
          slot: true,
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              status: true,
              brand: { select: { name: true } },
            },
          },
        },
      },
    },
  })
  // No row, or a snapshot that lost its items (D9): nothing to show
  if (!build || build.items.length === 0) return null

  // Only active products are read in full. A product that is no longer
  // active is listed by name and brand alone: its price, description and
  // specs stay private.
  const parts = new Map(
    (
      await getBuilderParts(
        build.items
          .filter((item) => item.product.status === "ACTIVE")
          .map((item) => item.product.id),
        today
      )
    ).map((data) => [data.part.id, data])
  )

  const items = toSharedItems(build.items, parts)
  return items.length > 0 ? { slug: build.shareSlug, items } : null
}

// `cache` shares one read between the page's metadata and its body within a
// request. `today` is Manila's date, for pre-orders; tests pass a fixed one.
export const getSharedBuild = cache(
  (slug: string, today: string = manilaToday()) => load(slug, today)
)
