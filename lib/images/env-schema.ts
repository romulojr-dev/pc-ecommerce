import { z } from "zod"

// The image variables' schemas (docs/specs/049-product-images-upload, §6,
// R11–R13; ADR 0013). Here, and not in storage.ts, because lib/env.ts and
// next.config.ts import it. Pure.
//
// Messages never repeat a value: the Blob token is a secret, and lib/env.ts
// prints each message after the variable's name.

// Required, with no default: a forgotten variable stops startup instead of
// quietly storing photos in the wrong place
export const imageStorageSchema = z.enum(["blob", "fake"], {
  error: (issue) =>
    issue.input === undefined ? "is not set" : "must be blob or fake",
})

export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com"

// How this environment reaches its store (ADR 0013). Vercel's default for a
// connected store is OIDC: BLOB_STORE_ID plus the short-lived
// VERCEL_OIDC_TOKEN, which @vercel/blob reads and refreshes itself, so the app
// never reads it. BLOB_READ_WRITE_TOKEN, a long-lived static token, is the
// fallback (a connection made without OIDC, or code running off Vercel). The
// SDK takes an explicit storeId with OIDC and falls back to the token in
// process.env when there is no OIDC token.
export type BlobAuth = { storeId: string } | { token: string }

// BLOB_STORE_ID is `store_{id}` or `{id}` (the SDK accepts both)
const STORE_ID = /^(?:store_)?([A-Za-z0-9]+)$/

export function blobStoreIdOf(value: string): string | null {
  const match = STORE_ID.exec(value)
  return match ? match[1] : null
}

// A Vercel Blob read-write token is `vercel_blob_rw_{storeId}_{random}`
const TOKEN = /^vercel_blob_rw_([A-Za-z0-9]+)_[A-Za-z0-9]+$/

export function blobTokenStoreIdOf(token: string): string | null {
  const match = TOKEN.exec(token)
  return match ? match[1] : null
}

// The store's public host is the lower-cased store id plus the suffix
function hostOfStoreId(storeId: string): string {
  return `${storeId.toLowerCase()}${BLOB_HOST_SUFFIX}`
}

export function blobHostOf(token: string): string | null {
  const storeId = blobTokenStoreIdOf(token)
  return storeId ? hostOfStoreId(storeId) : null
}

type BlobValues = {
  BLOB_STORE_ID?: string
  BLOB_READ_WRITE_TOKEN?: string
}

// This environment's store: its host (for remotePatterns and "own store"
// deletes) and the credentials to pass to the SDK. The store id wins when
// both are set; imageEnvIssues makes sure they then name the same store.
export function blobStoreOf(
  values: BlobValues
): { host: string; auth: BlobAuth } | null {
  if (values.BLOB_STORE_ID) {
    const storeId = blobStoreIdOf(values.BLOB_STORE_ID)
    return storeId ? { host: hostOfStoreId(storeId), auth: { storeId } } : null
  }
  if (values.BLOB_READ_WRITE_TOKEN) {
    const host = blobHostOf(values.BLOB_READ_WRITE_TOKEN)
    return host ? { host, auth: { token: values.BLOB_READ_WRITE_TOKEN } } : null
  }
  return null
}

const HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/

// Optional, Preview only: production's store host, set when the preview
// databases are branched from production (spec 049, D7)
export const blobProductionHostSchema = z
  .string()
  .regex(HOST, "must be a Vercel Blob host (…public.blob.vercel-storage.com)")
  .optional()

export type ImageEnvValues = BlobValues & {
  IMAGE_STORAGE?: string
  VERCEL_ENV?: string
}

export type ImageEnvIssue = {
  variable: keyof ImageEnvValues
  message: string
}

// The rules that need more than one variable (E41, E42)
export function imageEnvIssues(values: ImageEnvValues): ImageEnvIssue[] {
  const issues: ImageEnvIssue[] = []
  if (values.IMAGE_STORAGE === "fake" && values.VERCEL_ENV === "production") {
    issues.push({
      variable: "IMAGE_STORAGE",
      message: "must be blob in production",
    })
  }
  if (values.IMAGE_STORAGE !== "blob") return issues
  const { BLOB_STORE_ID: storeIdValue, BLOB_READ_WRITE_TOKEN: token } = values
  if (!storeIdValue && !token) {
    issues.push({
      variable: "BLOB_STORE_ID",
      message:
        "is not set (IMAGE_STORAGE=blob needs BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN)",
    })
    return issues
  }
  const storeId = storeIdValue ? blobStoreIdOf(storeIdValue) : null
  if (storeIdValue && storeId === null) {
    issues.push({
      variable: "BLOB_STORE_ID",
      message: "is not a Vercel Blob store id (store_…)",
    })
  }
  const tokenStoreId = token ? blobTokenStoreIdOf(token) : null
  if (token && tokenStoreId === null) {
    issues.push({
      variable: "BLOB_READ_WRITE_TOKEN",
      message: "is not a Vercel Blob read-write token",
    })
  }
  // The SDK falls back to the token when there is no OIDC token, so both
  // must name the store the host was derived from
  if (
    storeId !== null &&
    tokenStoreId !== null &&
    storeId.toLowerCase() !== tokenStoreId.toLowerCase()
  ) {
    issues.push({
      variable: "BLOB_READ_WRITE_TOKEN",
      message: "is for a different store than BLOB_STORE_ID",
    })
  }
  return issues
}

// The hosts next/image may fetch uploaded photos from: this environment's
// own store, and production's when the preview shares production's rows
// (spec 049, E43, E43b). The fake serves from this site, which needs no
// pattern. No wildcard host.
export function imageHostsOf(
  values: BlobValues & {
    IMAGE_STORAGE?: string
    BLOB_PRODUCTION_HOST?: string
  }
): string[] {
  if (values.IMAGE_STORAGE !== "blob") return []
  const own = blobStoreOf(values)?.host ?? null
  const hosts = [own, values.BLOB_PRODUCTION_HOST ?? null]
  return [...new Set(hosts.filter((host): host is string => host !== null))]
}

// next/image's remotePatterns for those hosts: https only, and only the
// products/ folder of the store (R11). The array may be empty.
export function imageRemotePatterns(
  values: Parameters<typeof imageHostsOf>[0]
): { protocol: "https"; hostname: string; pathname: string }[] {
  return imageHostsOf(values).map((hostname) => ({
    protocol: "https",
    hostname,
    pathname: "/products/**",
  }))
}
