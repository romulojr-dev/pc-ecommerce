import "server-only"

import { adminTransaction, recordAudit } from "@/lib/admin/audit"
import type { AdminActor } from "@/lib/admin/guard"
import { validateAlt } from "@/lib/images/rules"
import {
  type DeleteResult,
  type ImageStorage,
  imageStorage,
} from "@/lib/images/storage"

import {
  type RemoveImageInput,
  type ReorderImagesInput,
  type SetImageAltInput,
  sameIds,
} from "./input"

// Reordering, renaming (alt text) and removing a product's photos
// (docs/specs/049-product-images-upload, B10–B12, R6–R10). The server actions
// only forward here, after the guard has checked the origin, the session and
// `can("images.write")`.
//
// Every write locks the product row first (FOR UPDATE), so uploads, reorders
// and removals of one product serialize, and checks the screen's list against
// the product's current one: a screen that went out of date is refused as
// `stale` and nothing is written. The change and its audit row share one
// transaction. Removing a photo deletes its file AFTER the commit, best-effort
// and only from this environment's own store (R6). The caller invalidates the
// product cache with updateTag after a write.

type Tx = Parameters<Parameters<typeof adminTransaction>[0]>[0]

// The product's photos in display order; locks the product row. Null when the
// product does not exist.
async function lockedPhotos(tx: Tx, productId: string) {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
  if (locked.length === 0) return null
  return tx.productImage.findMany({
    where: { productId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, url: true, alt: true, sortOrder: true },
  })
}

async function renumber(tx: Tx, orderedIds: string[]) {
  for (const [position, id] of orderedIds.entries()) {
    await tx.productImage.update({
      where: { id },
      data: { sortOrder: position },
    })
  }
}

export type ReorderResult =
  | { kind: "saved"; order: string[] }
  | { kind: "unchanged" }
  | { kind: "stale" }
  | { kind: "not-found" }

export async function reorderProductImages(
  actor: AdminActor,
  input: ReorderImagesInput
): Promise<ReorderResult> {
  return adminTransaction(async (tx): Promise<ReorderResult> => {
    const photos = await lockedPhotos(tx, input.productId)
    if (!photos) return { kind: "not-found" }
    const current = photos.map((photo) => photo.id)
    if (!sameIds(current, input.order)) return { kind: "stale" }
    if (current.every((id, i) => id === input.order[i])) {
      return { kind: "unchanged" }
    }
    await renumber(tx, input.order)
    await recordAudit(tx, {
      actorId: actor.id,
      entity: "product",
      entityId: input.productId,
      action: "images-reordered",
      before: { photoOrder: current.join(",") },
      after: { photoOrder: input.order.join(",") },
    })
    return { kind: "saved", order: input.order }
  })
}

export type AltResult =
  | { kind: "saved"; alt: string }
  | { kind: "unchanged"; alt: string }
  | { kind: "invalid"; error: "empty" | "too-long" }
  | { kind: "not-found" }

export async function setImageAlt(
  actor: AdminActor,
  input: SetImageAltInput
): Promise<AltResult> {
  const checked = validateAlt(input.alt)
  if (!checked.ok) return { kind: "invalid", error: checked.error }
  const alt = checked.value

  return adminTransaction(async (tx): Promise<AltResult> => {
    // The photo's product, so the lock is the product's (R8)
    const photo = await tx.productImage.findUnique({
      where: { id: input.imageId },
      select: { productId: true },
    })
    if (!photo) return { kind: "not-found" }
    const photos = await lockedPhotos(tx, photo.productId)
    // Removed while waiting for the lock
    const row = photos?.find((p) => p.id === input.imageId)
    if (!row) return { kind: "not-found" }
    if (row.alt === alt) return { kind: "unchanged", alt }

    await tx.productImage.update({
      where: { id: row.id },
      data: { alt },
    })
    await recordAudit(tx, {
      actorId: actor.id,
      entity: "product",
      entityId: photo.productId,
      action: "image-alt-changed",
      before: { imageId: row.id, alt: row.alt },
      after: { imageId: row.id, alt },
    })
    return { kind: "saved", alt }
  })
}

export type RemoveResult =
  | {
      kind: "removed"
      // The product has no photo left: the placeholder is back
      lastPhoto: boolean
      deleted: DeleteResult
    }
  | { kind: "stale" }
  | { kind: "not-found" }

export type RemoveOptions = { storage?: ImageStorage }

export async function removeProductImage(
  actor: AdminActor,
  input: RemoveImageInput,
  options: RemoveOptions = {}
): Promise<RemoveResult> {
  const committed = await adminTransaction(
    async (tx): Promise<RemoveResult & { url?: string }> => {
      const photos = await lockedPhotos(tx, input.productId)
      if (!photos) return { kind: "not-found" }
      const current = photos.map((photo) => photo.id)
      const target = photos.find((photo) => photo.id === input.imageId)
      // The screen's list is the product's, and the photo is one of them
      if (!target || !sameIds(current, input.shown)) return { kind: "stale" }

      await tx.productImage.delete({ where: { id: target.id } })
      const rest = current.filter((id) => id !== target.id)
      await renumber(tx, rest)
      await recordAudit(tx, {
        actorId: actor.id,
        entity: "product",
        entityId: input.productId,
        action: "image-removed",
        before: {
          imageId: target.id,
          url: target.url,
          alt: target.alt,
          position: target.sortOrder,
        },
      })
      return {
        kind: "removed",
        lastPhoto: rest.length === 0,
        deleted: "skipped",
        url: target.url,
      }
    }
  )
  if (committed.kind !== "removed" || !committed.url) return committed

  // After the commit, outside any transaction: best-effort, never fails the
  // removal (R6)
  const deleted = await (options.storage ?? imageStorage()).delete(
    committed.url
  )
  return { kind: "removed", lastPhoto: committed.lastPhoto, deleted }
}
