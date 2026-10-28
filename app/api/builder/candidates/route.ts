import type { NextRequest } from "next/server"

import { builderCandidatesQuerySchema } from "@/lib/build-state/candidates"
import { getBuilderCandidates } from "@/lib/builder-candidates"
import { manilaToday } from "@/lib/stock"

// The slot picker's candidates, fresh on every request (docs/specs/021-slot-
// picker, Rules › Candidates; ADR 0003). GET route handlers aren't cached by
// Next; no-store keeps CDNs and browsers from keeping a copy too.
const headers = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const slot = builderCandidatesQuerySchema.safeParse(
    request.nextUrl.searchParams.getAll("slot")
  )
  if (!slot.success) {
    return Response.json({ error: "Invalid slot" }, { status: 400, headers })
  }
  const today = manilaToday()
  const candidates = await getBuilderCandidates(slot.data, today)
  return Response.json({ today, candidates }, { headers })
}
