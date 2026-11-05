// TEMPORARY (docs/specs/039-staff-sign-in-admin-shell, plan task 1): answers
// only booleans, to learn on a preview whether Vercel's system variables are
// present with Deployment Protection on. Deleted in task 10; it must never
// reach main.
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  const host = request.headers.get("host") ?? ""
  const url = process.env.VERCEL_URL
  const branch = process.env.VERCEL_BRANCH_URL
  return Response.json(
    {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      vercelUrlSet: Boolean(url),
      vercelUrlEqualsHost: url === host,
      vercelBranchUrlSet: Boolean(branch),
      vercelBranchUrlEqualsHost: branch === host,
      hostEndsWithVercelApp: host.endsWith(".vercel.app"),
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
