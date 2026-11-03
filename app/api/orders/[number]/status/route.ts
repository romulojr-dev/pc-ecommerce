import type { NextRequest } from "next/server"

import { credentialFromHeaders } from "@/lib/orders/credential"
import { findOrderByCredential } from "@/lib/orders/get-order"

// An order's status for the return page's polling (docs/specs/031-pay-with-
// xendit, Behavior 7–8, R1–R3). The credential comes only from a header,
// never the URL, so request logs don't record it a second time:
// X-Order-Key (the access token) or X-Order-Link (a signed link's query
// string; docs/specs/035-email-foundation-signed-links). The same checks as
// the order page: a wrong credential, none, an unknown number and a
// malformed one are the same 404, and a malformed one is answered without a
// database read. Only the status is returned.
const headers = { "Cache-Control": "no-store" }

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/orders/[number]/status">
) {
  const { number } = await ctx.params
  const order = await findOrderByCredential(
    number,
    credentialFromHeaders(request.headers)
  )
  if (!order) {
    return Response.json({ error: "not-found" }, { status: 404, headers })
  }
  return Response.json({ status: order.status }, { headers })
}
