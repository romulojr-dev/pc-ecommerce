import type { NextRequest } from "next/server"

import { parsePsgcPath, readPsgcText } from "@/lib/psgc/files"

// The address files for the browser (docs/specs/028-shipping-data-and-fee-
// rules, Behavior 8, D12). They are read from the same place resolveAddress
// reads them. The version is in the URL, so a file never changes and may be
// kept forever. A miss is never kept: a later version may add the file.
const OK_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=31536000, immutable",
}
const MISS_HEADERS = { "Cache-Control": "no-store" }

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/psgc/[version]/[...file]">
) {
  const { version, file } = await ctx.params
  const ref = parsePsgcPath(version, file)
  const text = ref ? await readPsgcText(ref) : null
  if (text === null) {
    return new Response(null, { status: 404, headers: MISS_HEADERS })
  }
  return new Response(text, { headers: OK_HEADERS })
}
