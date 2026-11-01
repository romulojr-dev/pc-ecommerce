import { env } from "@/lib/env"
import { runReleaseCron } from "@/lib/orders/release-cron"

// The daily release of unpaid orders (docs/specs/033-release-unpaid-orders,
// behavior 26–30), called by Vercel's cron (vercel.json, 16:00 UTC = midnight
// Manila) with `Authorization: Bearer ${CRON_SECRET}`. Batches run for at most
// 50 seconds; 60 leaves room for the last one. On the Hobby plan with Fluid
// compute the limit is 300 s.
export const runtime = "nodejs"
export const maxDuration = 60

const headers = { "Cache-Control": "no-store" }

export async function GET(request: Request) {
  const answer = await runReleaseCron(request.headers.get("authorization"), {
    secret: env.CRON_SECRET,
  })
  if (answer.status === 401) {
    return new Response(null, { status: 401, headers })
  }
  return Response.json(answer.body, { status: answer.status, headers })
}
