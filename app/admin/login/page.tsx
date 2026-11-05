import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { LoginForm } from "@/components/admin/login-form"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { ADMIN_HOME, safeNext } from "@/lib/admin/safe-next"
import { getAdminSession } from "@/lib/admin/session"
import { DEMO_EMAIL } from "@/lib/auth/accounts"
import { env } from "@/lib/env"

// The staff sign-in form (docs/specs/039-staff-sign-in-admin-shell, Rules 16
// and 17). Not indexed, no canonical. The proxy lets a signed-out visit
// through, so the form renders with no redirect. This is the one admin page
// that doesn't call requireAdminSession: it is where that call sends people.
export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.login },
  robots: { index: false, follow: false },
}

export default async function AdminLoginPage({
  searchParams,
}: PageProps<"/admin/login">) {
  // Per request: the demo box follows the running environment
  await connection()

  // A person who is signed in has no use for the form. A stale cookie gives
  // no session, so it sees the form (no redirect loop).
  if (await getAdminSession()) redirect(ADMIN_HOME)

  const { next } = await searchParams
  const target = safeNext(typeof next === "string" ? next : undefined)

  // The demo password is public by design (D17); unset, there is no box
  const demo = env.DEMO_ACCOUNT_PASSWORD
    ? { email: DEMO_EMAIL, password: env.DEMO_ACCOUNT_PASSWORD }
    : null

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <LoginForm next={target} demo={demo} />
    </main>
  )
}
