import type { NextRequest } from "next/server"

import { findOrderByKey } from "@/lib/orders/get-order"
import { ORDER_KEY_HEADER } from "@/lib/orders/link"

// An order's status for the return page's polling (docs/specs/031-pay-with-
// xendit, Behavior 7–8, R1–R3). The key comes only from the X-Order-Key
// header, never the URL, so request logs don't record the token a second
// time. The same checks as the order page: a wrong key, no key, an unknown
// number and a malformed one are the same 404, and a malformed one is
// answered without a database read. Only the status is returned.
const headers = { "Cache-Control": "no-store" }

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/orders/[number]/status">
) {
  const { number } = await ctx.params
  const order = await findOrderByKey(
    number,
    request.headers.get(ORDER_KEY_HEADER)
  )
  if (!order) {
    return Response.json({ error: "not-found" }, { status: 404, headers })
  }
  return Response.json({ status: order.status }, { headers })
}
