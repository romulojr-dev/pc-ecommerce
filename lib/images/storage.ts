import "server-only"

import { db } from "@/lib/db"
import { env } from "@/lib/env"

import { blobStorage, codeOf, type ImageStorage } from "./blob-storage"
import { logImageEvent } from "./log"
import { classifyStoredUrl, FAKE_IMAGE_PATH } from "./own-store"

// Which store this environment writes photos to (docs/specs/049-product-
// images-upload, R12, R14): Vercel Blob, or the FakeStoredImage table for
// local runs, CI and E2E (served by GET /test-images/{name}). Nothing here
// runs inside a transaction.

export { newImageName } from "./blob-storage"
export type { DeleteResult, ImageStorage, PutResult } from "./blob-storage"

export const fakeStorage: ImageStorage = {
  async put(name, bytes, contentType) {
    try {
      await db.fakeStoredImage.create({
        data: { name, contentType, bytes: Buffer.from(bytes) },
      })
      return { ok: true, url: `${FAKE_IMAGE_PATH}${name}` }
    } catch (error) {
      return { ok: false, code: codeOf(error) }
    }
  },
  async delete(url) {
    const target = classifyStoredUrl(url, null)
    if (target.kind !== "fake") {
      logImageEvent({
        event: "image.delete_skipped",
        host: target.kind === "other" ? target.host : "fake",
        code: "other-store",
      })
      return "skipped"
    }
    try {
      await db.fakeStoredImage.deleteMany({ where: { name: target.name } })
      return "deleted"
    } catch (error) {
      logImageEvent({
        event: "image.delete_failed",
        path: `${FAKE_IMAGE_PATH}${target.name}`,
        code: codeOf(error),
      })
      return "failed"
    }
  },
}

export function imageStorage(): ImageStorage {
  return env.IMAGE_STORAGE === "blob"
    ? blobStorage(env.BLOB_READ_WRITE_TOKEN ?? "")
    : fakeStorage
}
