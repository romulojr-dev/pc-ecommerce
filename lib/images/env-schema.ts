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

// A Vercel Blob read-write token is `vercel_blob_rw_{storeId}_{random}`; the
// store's public host is the lower-cased store id plus the suffix
const TOKEN = /^vercel_blob_rw_([A-Za-z0-9]+)_[A-Za-z0-9]+$/

export function blobHostOf(token: string): string | null {
  const match = TOKEN.exec(token)
  return match ? `${match[1].toLowerCase()}${BLOB_HOST_SUFFIX}` : null
}

const HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/

// Optional, Preview only: production's store host, set when the preview
// databases are branched from production (spec 049, D7)
export const blobProductionHostSchema = z
  .string()
  .regex(HOST, "must be a Vercel Blob host (…public.blob.vercel-storage.com)")
  .optional()

export type ImageEnvValues = {
  IMAGE_STORAGE?: string
  BLOB_READ_WRITE_TOKEN?: string
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
  if (values.IMAGE_STORAGE === "blob") {
    const token = values.BLOB_READ_WRITE_TOKEN
    if (!token) {
      issues.push({
        variable: "BLOB_READ_WRITE_TOKEN",
        message: "is not set (required with IMAGE_STORAGE=blob)",
      })
    } else if (blobHostOf(token) === null) {
      issues.push({
        variable: "BLOB_READ_WRITE_TOKEN",
        message: "is not a Vercel Blob read-write token",
      })
    }
  }
  return issues
}

// The hosts next/image may fetch uploaded photos from: this environment's
// own store, and production's when the preview shares production's rows
// (spec 049, E43, E43b). The fake serves from this site, which needs no
// pattern. No wildcard host.
export function imageHostsOf(values: {
  IMAGE_STORAGE?: string
  BLOB_READ_WRITE_TOKEN?: string
  BLOB_PRODUCTION_HOST?: string
}): string[] {
  if (values.IMAGE_STORAGE !== "blob") return []
  const own = values.BLOB_READ_WRITE_TOKEN
    ? blobHostOf(values.BLOB_READ_WRITE_TOKEN)
    : null
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
