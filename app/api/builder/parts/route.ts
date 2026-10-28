import type { NextRequest } from "next/server"

import { builderPartsQuerySchema } from "@/lib/build-state/parts"
import { getBuilderParts } from "@/lib/builder-parts"
import { manilaToday } from "@/lib/stock"

// The builder page's parts, fresh on every request (docs/specs/020-builder-
// page, Rules › Parts request; ADR 0003). GET route handlers aren't cached by
// Next; no-store keeps CDNs and browsers from keeping a copy too.
const headers = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const ids = builderPartsQuerySchema.safeParse(
    request.nextUrl.searchParams.get("ids")
  )
  if (!ids.success) {
    return Response.json({ error: "Invalid ids" }, { status: 400, headers })
  }
  const parts = await getBuilderParts(ids.data, manilaToday())
  return Response.json({ parts }, { headers })
}
