import { readFile } from "node:fs/promises"
import path from "node:path"

import { PSGC_VERSION } from "./version"

// The one reader of the generated address files in data/psgc/json/{version}/
// (docs/specs/028-shipping-data-and-fee-rules, D12). The data route and
// resolveAddress both go through it, so the browser and the server see the
// same data. Node only: no client component imports it.

export type PsgcFile =
  | { kind: "manifest" }
  | { kind: "regions" }
  | { kind: "provinces"; code: string }
  | { kind: "cities"; code: string }

const CODE = /^\d{10}$/

// Maps a request path to a file, or null. It accepts only the four known
// shapes and the current version, so request text never becomes a file path.
export function parsePsgcPath(
  version: string,
  segments: readonly string[]
): PsgcFile | null {
  if (version !== PSGC_VERSION) return null
  if (segments.length === 1) {
    if (segments[0] === "manifest.json") return { kind: "manifest" }
    if (segments[0] === "regions.json") return { kind: "regions" }
    return null
  }
  if (segments.length === 2) {
    const [folder, name] = segments
    const match = /^(\d{10})\.json$/.exec(name)
    if (!match || !CODE.test(match[1])) return null
    if (folder === "provinces") return { kind: "provinces", code: match[1] }
    if (folder === "cities") return { kind: "cities", code: match[1] }
  }
  return null
}

function relativePath(file: PsgcFile): string {
  switch (file.kind) {
    case "manifest":
      return "manifest.json"
    case "regions":
      return "regions.json"
    default:
      return `${file.kind}/${file.code}.json`
  }
}

// Files never change for a version, so a read is kept for the life of the
// process. null (no such file) is kept too.
const cache = new Map<string, string | null>()

// The file's text exactly as committed, or null when there is no such file
export async function readPsgcText(file: PsgcFile): Promise<string | null> {
  const relative = relativePath(file)
  if (cache.has(relative)) return cache.get(relative)!
  let text: string | null
  try {
    text = await readFile(
      path.join(process.cwd(), "data", "psgc", "json", PSGC_VERSION, relative),
      "utf8"
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    text = null
  }
  cache.set(relative, text)
  return text
}

export async function readPsgcJson<T>(file: PsgcFile): Promise<T | null> {
  const text = await readPsgcText(file)
  return text === null ? null : (JSON.parse(text) as T)
}
