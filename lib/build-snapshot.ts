import { randomUUID } from "node:crypto"

import type { Prisma } from "@/generated/prisma/client"
import { contentHashOf } from "@/lib/build-share-hash"
import { randomSlug } from "@/lib/build-share-slug"
import { type BuildItem, canonicalItems } from "@/lib/builder"

// The one write of a build snapshot (docs/specs/026-add-build-to-cart, D5;
// ADR 0007). Sharing and Add build to cart both call it: the cart runs it in
// the same transaction as its lines. Postgres aborts a transaction after any
// error, so it can't rely on catching a unique violation and reading the row
// back. It inserts with ON CONFLICT DO NOTHING and no conflict target, so a
// duplicate contentHash and a random shareSlug collision both come back as
// "no row" and neither raises.

// A slug that collides with another build's is retried this many times in
// all. With 36^10 slugs it takes bad luck or a broken generator.
export const SLUG_ATTEMPTS = 3

export class SnapshotSlugError extends Error {
  constructor() {
    super(`no free share slug after ${SLUG_ATTEMPTS} tries`)
    this.name = "SnapshotSlugError"
  }
}

type Tx = Prisma.TransactionClient

export type Snapshot = {
  id: string
  shareSlug: string
  // False when a build with these contents already existed
  created: boolean
}

// `items` must already be validated (shareInput, assembleBuild). Finds the
// build with these contents or creates it with its items, never writing the
// items of an existing one. Concurrent callers with the same new contents
// wait for each other on the insert, so only one creates the row.
export async function upsertBuildSnapshot(
  tx: Tx,
  items: readonly BuildItem[],
  { newSlug = randomSlug }: { newSlug?: () => string } = {}
): Promise<Snapshot> {
  const contentHash = contentHashOf(items)

  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const inserted = await tx.$queryRaw<{ id: string; shareSlug: string }[]>`
      INSERT INTO "Build" ("id", "shareSlug", "contentHash")
      VALUES (${randomUUID()}, ${newSlug()}, ${contentHash})
      ON CONFLICT DO NOTHING
      RETURNING "id", "shareSlug"`
    if (inserted.length > 0) {
      await tx.buildItem.createMany({
        data: canonicalItems(items).map(([slot, productId, quantity]) => ({
          buildId: inserted[0].id,
          slot,
          productId,
          quantity,
        })),
      })
      return { ...inserted[0], created: true }
    }

    // Nothing inserted: these contents are already stored (maybe committed
    // just now by a concurrent request), or the slug was taken
    const existing = await tx.build.findUnique({
      where: { contentHash },
      select: { id: true, shareSlug: true },
    })
    if (existing) return { ...existing, created: false }
  }
  throw new SnapshotSlugError()
}
