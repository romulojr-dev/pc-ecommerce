import "server-only"

import { adminTransaction, recordAudit } from "@/lib/admin/audit"
import type { AdminActor } from "@/lib/admin/guard"
import { type ImageReason, IMAGE_REASONS } from "@/lib/admin/images-copy"
import { db } from "@/lib/db"
import { logImageEvent } from "@/lib/images/log"
import { reencodeImage } from "@/lib/images/reencode"
import {
  declaredLength,
  detectImageType,
  MAX_ALT_LENGTH,
  MAX_IMAGES_PER_PRODUCT,
  MAX_UPLOAD_BYTES,
  readCappedBody,
} from "@/lib/images/rules"
import {
  type ImageStorage,
  imageStorage,
  newImageName,
} from "@/lib/images/storage"

// Adding one photo to a product (docs/specs/049-product-images-upload,
// B14–B17, R1–R5, R8, R19). The route forwards here after the guard has
// checked the origin, the session and `can("images.write")`, before this
// reads the body.
//
// In order, stopping at the first failure with nothing written: declared
// length, body (capped), type by its bytes, product and room, re-encode, the
// store upload, then ONE transaction (lock the product, re-check the room,
// insert at the end, audit row). The store upload is outside any transaction
// and before the row write; a transaction that refuses or fails deletes the
// just-stored file after it rolled back. The caller invalidates the product
// cache after an `added` result.

export type UploadStatus = 400 | 404 | 409 | 411 | 413 | 500 | 502

export type UploadResult =
  | { kind: "added"; image: { id: string; url: string; alt: string } }
  | {
      kind: "refused"
      status: UploadStatus
      error: ImageReason
      message: string
    }

const refuse = (status: UploadStatus, error: ImageReason): UploadResult => ({
  kind: "refused",
  status,
  error,
  message: IMAGE_REASONS[error],
})

export type UploadOptions = {
  storage?: ImageStorage
  // Test seam: runs after the file is stored and before the transaction, so a
  // test can fill the product in between (E13)
  afterStore?: () => void | Promise<void>
}

export async function uploadProductImage(
  actor: AdminActor,
  input: {
    productId: string
    contentLength: string | null
    body: ReadableStream<Uint8Array> | null
  },
  options: UploadOptions = {}
): Promise<UploadResult> {
  const length = declaredLength(input.contentLength)
  if (length === null) return refuse(411, "length")
  if (length > MAX_UPLOAD_BYTES) return refuse(413, "tooLarge")

  const bytes = await readCappedBody(input.body, MAX_UPLOAD_BYTES)
  if (bytes === "too-large") return refuse(413, "tooLarge")
  if (detectImageType(bytes) === null) return refuse(400, "type")

  // Cheap checks before the work, so a refused upload costs no store
  // operation (R4); both are checked again under the product lock
  const product = await db.product.findUnique({
    where: { id: input.productId },
    select: { id: true, _count: { select: { images: true } } },
  })
  if (!product) return refuse(404, "notFound")
  if (product._count.images >= MAX_IMAGES_PER_PRODUCT) {
    return refuse(409, "full")
  }

  const encoded = await reencodeImage(bytes)
  if (encoded === "too-many-pixels") return refuse(400, "pixels")
  if (encoded === "unreadable") return refuse(400, "unreadable")

  const storage = options.storage ?? imageStorage()
  const stored = await storage.put(newImageName(), encoded.bytes, "image/webp")
  if (!stored.ok) {
    logImageEvent({
      event: "image.upload",
      outcome: "store-failed",
      productId: input.productId,
      code: stored.code,
    })
    return refuse(502, "store")
  }
  await options.afterStore?.()

  try {
    const result = await adminTransaction(async (tx): Promise<UploadResult> => {
      const locked = await tx.$queryRaw<{ name: string }[]>`
          SELECT "name" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`
      if (locked.length === 0) return refuse(404, "notFound")

      const { _count, _max } = await tx.productImage.aggregate({
        where: { productId: input.productId },
        _count: true,
        _max: { sortOrder: true },
      })
      if (_count >= MAX_IMAGES_PER_PRODUCT) return refuse(409, "full")

      const alt = locked[0].name.slice(0, MAX_ALT_LENGTH)
      const position = _max.sortOrder === null ? 0 : _max.sortOrder + 1
      const row = await tx.productImage.create({
        data: {
          productId: input.productId,
          url: stored.url,
          alt,
          sortOrder: position,
        },
        select: { id: true, url: true, alt: true },
      })
      await recordAudit(tx, {
        actorId: actor.id,
        entity: "product",
        entityId: input.productId,
        action: "image-added",
        after: { imageId: row.id, url: row.url, alt: row.alt, position },
      })
      return { kind: "added", image: row }
    })
    if (result.kind !== "added") await storage.delete(stored.url)
    else {
      logImageEvent({
        event: "image.upload",
        outcome: "added",
        productId: input.productId,
      })
    }
    return result
  } catch (error) {
    // The transaction rolled back: the stored file belongs to no row
    await storage.delete(stored.url)
    throw error
  }
}
