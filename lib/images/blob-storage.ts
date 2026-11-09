import "server-only"

import { randomBytes } from "node:crypto"

import { blobHostOf } from "./env-schema"
import { logImageEvent } from "./log"
import { classifyStoredUrl } from "./own-store"

// The Vercel Blob adapter and the storage contract (docs/specs/049-product-
// images-upload, §6; ADR 0013). Provider-neutral, like PaymentGateway and
// EmailTransport. It imports no database or env, so a unit test can drive it
// with a double. No caller holds a transaction open around it (R5).

export type PutResult = { ok: true; url: string } | { ok: false; code: string }
export type DeleteResult = "deleted" | "skipped" | "failed"

export type ImageStorage = {
  // `name` is the random file name with its extension (abc.webp); the store
  // puts it under products/
  put(name: string, bytes: Uint8Array, contentType: string): Promise<PutResult>
  // Best-effort: never throws. Only a file in this environment's own store is
  // deleted (R6); anything else is "skipped" and logged.
  delete(url: string): Promise<DeleteResult>
}

// 22 random base64url characters (128 bits) and the extension. The filename
// the owner gave is never part of it (R5).
export function newImageName(): string {
  return `${randomBytes(16).toString("base64url")}.webp`
}

export const BLOB_TIMEOUT_MS = 10_000

// The two functions of @vercel/blob this uses, so a test can pass doubles
export type BlobClient = {
  put: (
    pathname: string,
    body: Buffer,
    options: {
      access: "public"
      addRandomSuffix: false
      allowOverwrite: false
      contentType: string
      token: string
      abortSignal: AbortSignal
    }
  ) => Promise<{ url: string }>
  del: (url: string, options: { token: string }) => Promise<void>
}

async function realBlob(): Promise<BlobClient> {
  const { put, del } = await import("@vercel/blob")
  return { put, del }
}

// A short code, never the error's message (it may repeat the token or a URL)
export function codeOf(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.name === "TimeoutError") {
      return "timeout"
    }
    return error.name || "error"
  }
  return "error"
}

export function blobStorage(
  token: string,
  client: () => Promise<BlobClient> = realBlob
): ImageStorage {
  const ownHost = blobHostOf(token)
  return {
    async put(name, bytes, contentType) {
      try {
        const blob = await (
          await client()
        ).put(`products/${name}`, Buffer.from(bytes), {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType,
          token,
          abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
        })
        return { ok: true, url: blob.url }
      } catch (error) {
        return { ok: false, code: codeOf(error) }
      }
    },
    async delete(url) {
      const target = classifyStoredUrl(url, ownHost)
      if (target.kind !== "own-blob") {
        logImageEvent({
          event: "image.delete_skipped",
          host: target.kind === "other" ? target.host : "fake",
          code: "other-store",
        })
        return "skipped"
      }
      try {
        await (await client()).del(url, { token })
        return "deleted"
      } catch (error) {
        logImageEvent({
          event: "image.delete_failed",
          path: new URL(url).pathname,
          code: codeOf(error),
        })
        return "failed"
      }
    },
  }
}
