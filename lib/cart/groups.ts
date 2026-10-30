import { sharedBuildView, toSharedItems } from "@/lib/build-state/shared"
import { getBuilderParts } from "@/lib/builder-parts"
import { db } from "@/lib/db"

import type { CartGroupView } from "./types"

// What /cart shows for build groups (docs/specs/026-add-build-to-cart,
// Behavior 13–16, D8): the snapshots' parts read fresh, once for all groups,
// and each group's total, status and issues from the same pure view the
// shared page uses. A part that is no longer active is listed by name and
// brand alone, and left out of the total and the checks.

export type GroupData = Omit<CartGroupView, "kind" | "number">

export async function loadGroups(
  buildIds: readonly string[],
  today: string
): Promise<Map<string, GroupData>> {
  if (buildIds.length === 0) return new Map()

  const builds = await db.build.findMany({
    where: { id: { in: [...buildIds] } },
    select: {
      id: true,
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

  const activeIds = new Set(
    builds.flatMap((build) =>
      build.items
        .filter((item) => item.product.status === "ACTIVE")
        .map((item) => item.product.id)
    )
  )
  const parts = new Map(
    (await getBuilderParts([...activeIds], today)).map((data) => [
      data.part.id,
      data,
    ])
  )

  const groups = new Map<string, GroupData>()
  for (const build of builds) {
    const view = sharedBuildView(toSharedItems(build.items, parts))
    const slots = view.slots.filter(({ rows }) => rows.length > 0)
    groups.set(build.id, {
      buildId: build.id,
      slug: build.shareSlug,
      partCount: slots.reduce((sum, { rows }) => sum + rows.length, 0),
      total: view.total,
      status: view.status,
      issues: view.issues,
      slots,
    })
  }
  return groups
}
